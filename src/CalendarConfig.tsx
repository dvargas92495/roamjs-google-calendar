import { Button, InputGroup, Label } from "@blueprintjs/core";
import React, { useMemo, useState } from "react";
import {
  createBlock,
  getBasicTreeByParentUid,
  RoamBasicNode,
} from "roam-client";
import { Description, MenuItemSelect } from "roamjs-components";
import { getOauthAccounts, toTitle } from "roamjs-components/dist/hooks";

const CalendarConfig = (props: {
  uid?: string;
  parentUid: string;
  title: string;
}): React.ReactElement => {
  const { title, uid: initialUid, parentUid } = props;
  const [uid, setUid] = useState(initialUid);
  const accounts = useMemo(() => getOauthAccounts("google"), []);
  const [value, setValue] = useState("");
  const [label, setLabel] = useState(accounts[0]);
  const [calendars, setCalendars] = useState(() =>
    uid ? getBasicTreeByParentUid(uid) : []
  );
  return (
    <>
      <div style={{ display: "flex" }}>
        <InputGroup value={value} onChange={(e) => setValue(e.target.value)} />
        {accounts.length > 1 && (
          <div style={{ margin: "0 4px" }}>
            <MenuItemSelect
              items={accounts}
              activeItem={label}
              onItemSelect={(l) => setLabel(l)}
            />
          </div>
        )}
        <Button
          icon={"plus"}
          minimal
          disabled={!value}
          onClick={() => {
            const valueUid = window.roamAlphaAPI.util.generateUID();
            if (uid) {
              window.roamAlphaAPI.createBlock({
                location: { "parent-uid": uid, order: calendars.length },
                block: { string: value, uid: valueUid },
              });
            } else {
              const newUid = window.roamAlphaAPI.util.generateUID();
              window.roamAlphaAPI.createBlock({
                block: { string: title, uid: newUid },
                location: { order: 0, "parent-uid": parentUid },
              });
              setTimeout(() => setUid(newUid));
              window.roamAlphaAPI.createBlock({
                block: { string: value, uid: valueUid },
                location: { order: 0, "parent-uid": newUid },
              });
            }
            const labelBlocks: RoamBasicNode[] = label
              ? [
                  {
                    text: label,
                    uid: window.roamAlphaAPI.util.generateUID(),
                    children: [],
                  },
                ]
              : [];
            if (labelBlocks.length)
              createBlock({ node: labelBlocks[0], parentUid: valueUid });
            setCalendars([
              ...calendars,
              { text: value, uid: valueUid, children: labelBlocks },
            ]);
            setValue("");
          }}
        />
      </div>
      {calendars.map((p) => (
        <div
          key={p.uid}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              overflow: "hidden",
            }}
          >
            {p.text}
            {p.children.length ? ` (${p.children[0].text})` : ""}
          </span>
          <Button
            icon={"trash"}
            minimal
            onClick={() => {
              window.roamAlphaAPI.deleteBlock({ block: { uid: p.uid } });
              setCalendars(calendars.filter((f) => f.uid !== p.uid));
            }}
          />
        </div>
      ))}
    </>
  );
};

export default CalendarConfig;
