import {
  Button,
  Classes,
  Dialog,
  InputGroup,
  Intent,
  Label,
  Spinner,
  SpinnerSize,
} from "@blueprintjs/core";
import React, { useCallback, useState } from "react";
import { createOverlayRender } from "roamjs-components";
import { DateInput } from "@blueprintjs/datetime";
import format from "date-fns/format";
import parse from "date-fns/parse";
import formatRFC3339 from "date-fns/formatRFC3339";
import { getAccessToken } from "./util";
import axios from "axios";
import {
  createBlock,
  getParentUidByBlockUid,
  getTextByBlockUid,
  getTreeByBlockUid,
  TreeNode,
  updateBlock,
} from "roam-client";

type Props = {
  summary: string;
  location: string;
  description: string;
  start: Date;
  end: Date;
  blockUid: string;
  edit?: string;
};

const DATE_FORMAT = "yyyy-MM-dd HH:mm:ss";

const CreateEventDialog = ({
  onClose,
  edit,
  summary,
  location,
  description,
  start,
  end,
  blockUid,
}: { onClose: () => void } & Props) => {
  const [summaryState, setSummaryState] = useState(summary);
  const [locationState, setLocationState] = useState(location);
  const [descriptionState, setDescriptionState] = useState(description);
  const [startState, setStartState] = useState(start);
  const [endState, setEndState] = useState(end);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const onFocus = useCallback(() => setError(""), [setError]);
  return (
    <Dialog
      isOpen={true}
      onClose={onClose}
      canEscapeKeyClose
      canOutsideClickClose
      title={`${edit ? "Update" : "Create"} Google Calendar Event`}
    >
      <div className={Classes.DIALOG_BODY}>
        <Label>
          Summary
          <InputGroup
            value={summaryState}
            onChange={(e) => setSummaryState(e.target.value)}
            placeholder={"Event summary"}
            onFocus={onFocus}
          />
        </Label>
        <Label>
          Description
          <InputGroup
            value={descriptionState}
            onChange={(e) => setDescriptionState(e.target.value)}
            placeholder={"Event description"}
            onFocus={onFocus}
          />
        </Label>
        <Label>
          Location
          <InputGroup
            value={locationState}
            onChange={(e) => setLocationState(e.target.value)}
            placeholder={"Event location"}
            onFocus={onFocus}
          />
        </Label>
        <Label>
          Start
          <DateInput
            formatDate={(d) => format(d, DATE_FORMAT)}
            parseDate={(s) => parse(s, DATE_FORMAT, new Date())}
            value={startState}
            onChange={(d) => setStartState(d)}
            inputProps={{
              onFocus,
            }}
            timePrecision={'minute'}
            maxDate={new Date(9999,11,31)}
          />
        </Label>
        <Label>
          End
          <DateInput
            formatDate={(d) => format(d, DATE_FORMAT)}
            parseDate={(s) => parse(s, DATE_FORMAT, new Date())}
            value={endState}
            onChange={(d) => setEndState(d)}
            inputProps={{
              onFocus,
            }}
            timePrecision={'minute'}
            maxDate={new Date(9999,11,31)}
          />
        </Label>
      </div>
      <div className={Classes.DIALOG_FOOTER}>
        <div className={Classes.DIALOG_FOOTER_ACTIONS}>
          <span style={{ color: "darkred" }}>{error}</span>
          {loading && <Spinner size={SpinnerSize.SMALL} />}
          <Button
            text={edit ? "Update" : "Create"}
            intent={Intent.PRIMARY}
            onClick={() => {
              setLoading(true);
              setTimeout(
                () =>
                  getAccessToken().then((token) => {
                    if (token) {
                      axios[edit ? "put" : "post"](
                        `https://www.googleapis.com/calendar/v3/calendars/primary/events${
                          edit ? `/${edit}` : ""
                        }`,
                        {
                          summary: summaryState,
                          description: descriptionState,
                          location: locationState,
                          start: { dateTime: formatRFC3339(startState) },
                          end: { dateTime: formatRFC3339(endState) },
                        },
                        { headers: { Authorization: `Bearer ${token}` } }
                      )
                        .then((r) => {
                          if (!edit) {
                            createBlock({
                              parentUid: blockUid,
                              node: { text: `Link:: ${r.data.htmlLink}` },
                            });
                          } else {
                            const blockText = getTextByBlockUid(blockUid);
                            const nodeToUpdate = blockText.includes(summary)
                              ? getTreeByBlockUid(blockUid)
                              : getTreeByBlockUid(
                                  getParentUidByBlockUid(blockUid)
                                );
                            const updateNode = (n: TreeNode) => {
                              const newText = n.text
                                .replace(summary, r.data.summary)
                                .replace(description, r.data.description)
                                .replace(location, r.data.location);
                              if (newText !== n.text) {
                                updateBlock({ text: newText, uid: n.uid });
                              }
                              n.children.forEach(updateNode);
                            };
                            updateNode(nodeToUpdate);
                          }
                          onClose();
                        })
                        .catch((e) => {
                          setError(e.response?.data?.error?.message);
                          setLoading(false);
                        });
                    } else {
                      setError("Not logged in with Google");
                      setLoading(false);
                    }
                  }),
                1
              );
            }}
          />
        </div>
      </div>
    </Dialog>
  );
};

export const render = createOverlayRender<Props>(
  "gcal-event",
  CreateEventDialog
);

export default CreateEventDialog;
