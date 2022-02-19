import {
  addButtonListener,
  createHTMLObserver,
  pushBullets,
  getConfigFromPage,
  parseRoamDate,
  getParentUidByBlockUid,
  getTreeByPageName,
  createBlock,
  getUids,
  getOrderByBlockUid,
  updateBlock,
  getTextByBlockUid,
  getCurrentPageUid,
  getPageTitleByHtmlElement,
  getChildrenLengthByPageUid,
  runExtension,
  addRoamJSDependency,
  getTreeByBlockUid,
  getBlockUidAndTextIncludingText,
  createBlockObserver,
  createIconButton,
  registerSmartBlocksCommand,
  getPageTitleByBlockUid,
  getPageTitleByPageUid,
  TreeNode,
  InputTextNode,
} from "roam-client";
import axios from "axios";
import formatRFC3339 from "date-fns/formatRFC3339";
import startOfDay from "date-fns/startOfDay";
import endOfDay from "date-fns/endOfDay";
import addMinutes from "date-fns/addMinutes";
import { createConfigObserver } from "roamjs-components";
import { getAccessToken } from "./util";
import { render as eventRender, getCalendarIds } from "./CreateEventDialog";
import { parseDate } from "chrono-node";
import { blockFormatEvent, Event, formatEvent } from "./event";
import CalendarConfig from "./CalendarConfig";
// import { getRenderRoot } from "../components/hooks";
// import { render } from "../components/DeprecationWarning";

addRoamJSDependency("google");

const GOOGLE_COMMAND = "Import Google Calendar";
const DEFAULT_FORMAT = `{summary} ({start:hh:mm a} - {end:hh:mm a}){confLink}`;

const EMPTY_MESSAGE = "No Events Scheduled for Today!";
const UNAUTHORIZED_MESSAGE = `Error: Must log in to Google through the [[roam/js/google]] page`;
const CONFIG = "roam/js/google-calendar";
const textareaRef: { current: HTMLTextAreaElement } = {
  current: null,
};

const GCAL_EVENT_URL = "https://www.google.com/calendar/event?eid=";
const GCAL_EVENT_REGEX = new RegExp(
  `${GCAL_EVENT_URL.replace(/\//g, "\\/")
    .replace(/\./g, "\\.")
    .replace(/\?/g, "\\?")}([\\w\\d]*)`
);
const eventUids = {
  current: new Set<string>(),
};
const refreshEventUids = () => {
  eventUids.current = new Set(
    getBlockUidAndTextIncludingText(GCAL_EVENT_URL).map(({ uid }) => uid)
  );
};
refreshEventUids();

const fetchGoogleCalendar = async (
  pageTitle = getPageTitleByHtmlElement(document.activeElement).textContent
): Promise<InputTextNode[]> => {
  const dateFromPage = parseRoamDate(pageTitle);

  const legacyConfig = getConfigFromPage(CONFIG);
  const configTree = getTreeByPageName(CONFIG);
  const importTree = configTree.find((t) => /import/i.test(t.text));

  const calendarIds =
    importTree?.children?.find?.((t) => /calendars/i.test(t.text))?.children ||
    [legacyConfig["Google Calendar"]?.trim()]
      .filter((s) => !!s)
      .map((s) => ({ text: s as string, children: [] } as Partial<TreeNode>));
  if (!calendarIds.length) {
    return [
      {
        text: `Error: Could not find a calendar to import on the [[${CONFIG}]] page. Be sure to add one!`,
      },
    ];
  }
  const includeLink =
    importTree?.children?.some?.((t) => /include event link/i.test(t.text)) ||
    legacyConfig["Include Event Link"]?.trim() === "true";
  const skipFree =
    importTree?.children?.some?.((t) => /skip free/i.test(t.text)) ||
    legacyConfig["Skip Free"]?.trim() === "true";
  const format = importTree?.children?.find?.((t) => /format/i.test(t.text))
    ?.children?.[0] || {
    text: legacyConfig["Format"]?.trim?.() || DEFAULT_FORMAT,
  };
  if ((importTree?.children || []).some((t) => /add todo/i.test(t.text))) {
    format.text = `{{[[TODO]]}} ${format.text}`;
  }
  const filter =
    importTree?.children
      ?.find?.((t) => /filter/i.test(t.text))
      ?.children?.[0]?.text?.trim?.() || "";
  const dateToUse = isNaN(dateFromPage.valueOf()) ? new Date() : dateFromPage;
  const timeMin = startOfDay(dateToUse);
  const timeMax = endOfDay(timeMin);
  const timeMinParam = encodeURIComponent(formatRFC3339(timeMin));
  const timeMaxParam = encodeURIComponent(formatRFC3339(timeMax));

  return Promise.all(
    calendarIds
      .map((calendarId) => ({
        calendar: calendarId?.text,
        account: calendarId?.children[0]?.text,
      }))
      .map(({ calendar, account }) =>
        getAccessToken(account)
          .then((Authorization) =>
            Authorization
              ? axios
                  .get<{
                    items: Event[];
                  }>(
                    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
                      calendar
                    )}/events?timeMin=${timeMinParam}&timeMax=${timeMaxParam}&orderBy=startTime&singleEvents=true`,
                    {
                      headers: {
                        Authorization: `Bearer ${Authorization}`,
                      },
                    }
                  )
                  .then((r) => ({
                    items: r.data.items,
                    calendar,
                    error: "",
                  }))
              : Promise.resolve({
                  items: [] as Event[],
                  calendar,
                  error: `${UNAUTHORIZED_MESSAGE}${
                    account ? ` for account ${account}` : ""
                  }`,
                })
          )
          .catch((e) => ({
            items: [] as Event[],
            calendar,
            error: `Error for calendar ${calendar}: ${
              e.response?.data?.error?.message ===
              "Request failed with status code 404"
                ? `Could not find calendar or it's not public. For more information on how to make it public, [visit this page](https://roamjs.com/extensions/google-calendar)`
                : (e.response?.data?.error?.message as string) ||
                  (e.reponse?.data?.error as string) ||
                  (typeof e.response?.data === "object"
                    ? JSON.stringify(e.response.data)
                    : e.response?.data)
            }`,
          }))
      )
  )
    .then((rs) => ({
      events: rs
        .flatMap((r) => r.items.map((i) => ({ ...i, calendar: r.calendar })))
        .filter(
          filter
            ? (r) =>
                (r.summary && new RegExp(filter).test(r.summary)) ||
                (r.descripton && new RegExp(filter).test(r.descripton))
            : () => true
        )
        .sort((a, b) => {
          if (a.start?.dateTime === b.start?.dateTime) {
            return (a.summary || "").localeCompare(b.summary || "");
          } else if (!a.start?.dateTime) {
            return -1;
          } else if (!b.start?.dateTime) {
            return 1;
          } else {
            return (
              new Date(a.start.dateTime).valueOf() -
              new Date(b.start.dateTime).valueOf()
            );
          }
        }),
      errors: rs.map(({ error }) => error).filter((e) => !!e),
    }))
    .then(async ({ events = [], errors }) => {
      if (events.length === 0 && errors.length === 0) {
        return [{ text: EMPTY_MESSAGE }];
      }
      return [
        ...events
          .filter((e) => !skipFree || e.transparency !== "transparent")
          .filter(
            (e) =>
              !(e.attendees || []).some(
                (a) => a.self && a.responseStatus === "declined"
              )
          )
          .map((e) => blockFormatEvent(e, format, includeLink)),
        ...errors.map((e) => ({ text: e })),
      ];
    });
};

const pushBlocks = (
  bullets: InputTextNode[],
  blockUid: string,
  parentUid: string
) => {
  const blockIndex = getOrderByBlockUid(blockUid);
  for (let index = 0; index < bullets.length; index++) {
    const node = bullets[index];
    if (index === 0) {
      updateBlock({
        uid: blockUid,
        ...node,
      });
      (node.children || []).forEach((n, o) =>
        createBlock({
          node: n,
          parentUid: blockUid,
          order: o,
        })
      );
    } else {
      createBlock({
        node,
        parentUid,
        order: blockIndex + index,
      });
    }
  }
};

const importGoogleCalendar = async (
  _?: {
    [key: string]: string;
  },
  blockUid?: string
) => {
  /** Roam has no way to activate command palette on mobile yet -.-
    const parent = getRenderRoot("google-calendar-deprecation");
    render({
      parent,
      message:
        `The import google calendar button will be removed in a future version. Please start using the Import Google Calendar command from the command palette instead. To use the Roam command palette, hit ${isApple ? 'CMD' : 'CTRL'}+P.`,
      callback: () => {*/
  updateBlock({ text: "Loading...", uid: blockUid });
  const parentUid = getParentUidByBlockUid(blockUid);
  fetchGoogleCalendar(getPageTitleByPageUid(parentUid))
    .then((blocks) => pushBlocks(blocks, blockUid, parentUid))
    .then(() => setTimeout(refreshEventUids, 1));
  /*  },
      type: "Google Calendar Button",
    });*/
};

const loadBlockUid = (pageUid: string) => {
  if (textareaRef.current) {
    const uid = getUids(textareaRef.current).blockUid;
    const parentUid = getParentUidByBlockUid(uid);

    const text = getTextByBlockUid(uid);
    if (text.length) {
      return createBlock({
        node: { text: "Loading..." },
        parentUid,
        order: getOrderByBlockUid(uid) + 1,
      });
    }
    return updateBlock({
      uid,
      text: "Loading...",
    });
  }
  return createBlock({
    node: { text: "Loading..." },
    parentUid: pageUid,
    order: getChildrenLengthByPageUid(pageUid),
  });
};

const importGoogleCalendarCommand = () => {
  const focusedUid = window.roamAlphaAPI.ui.getFocusedBlock()?.["block-uid"];
  const parentUid =
    (focusedUid &&
      window.roamAlphaAPI.q(
        `[:find (pull ?p [:block/uid]) :where [?b :block/uid "${focusedUid}"] [?b :block/page ?p]]`
      )[0]?.[0]?.uid) ||
    getCurrentPageUid();
  const blockUid = loadBlockUid(parentUid);
  return fetchGoogleCalendar(getPageTitleByPageUid(parentUid))
    .then((blocks) => {
      pushBlocks(blocks, blockUid, getParentUidByBlockUid(blockUid));
    })
    .then(() => setTimeout(refreshEventUids, 1));
};

runExtension("google-calendar", () => {
  createConfigObserver({
    title: CONFIG,
    config: {
      tabs: [
        {
          id: "import",
          fields: [
            {
              type: "custom",
              title: "calendars",
              description:
                'The calendar ids to import events from. To find your calendar id, go to your calendar settings and scroll down to "Integrate Calendar".',
              defaultValue: [],
              options: {
                component: CalendarConfig,
              },
            },
            {
              type: "flag",
              title: "include event link",
              description:
                "Whether or not to hyperlink the summary with the event link. Ignored if 'format' is specified.",
            },
            {
              type: "flag",
              title: "skip free",
              description:
                "Whether or not to filter out events marked as 'free'",
            },
            {
              type: "block",
              title: "format",
              description:
                "The format each event should output in when imported into Roam.",
              defaultValue: { text: DEFAULT_FORMAT },
            },
            {
              type: "text",
              title: "filter",
              description:
                "A regex to filter your events by summary or description.",
            },
            {
              type: "flag",
              title: "add todo",
              description: "Prefix the format with {{[[TODO]]}} ",
            },
          ],
        },
      ],
      versioning: true,
    },
  });

  addButtonListener(GOOGLE_COMMAND, importGoogleCalendar);
  window.roamAlphaAPI.ui.commandPalette.addCommand({
    label: "Import Google Calendar",
    callback: importGoogleCalendarCommand,
  });

  window.roamAlphaAPI.ui.commandPalette.addCommand({
    label: "Add Google Calendar Event",
    callback: () => {
      const blockUid = window.roamAlphaAPI.ui.getFocusedBlock()?.["block-uid"];
      const node = blockUid && getTreeByBlockUid(blockUid);
      const props = node && {
        summary: node.text,
        ...Object.fromEntries(
          node.children.map((t) => {
            const [key, value] = t.text.split("::").map((s) => s.trim());
            const attr = key.toLowerCase();
            return [
              attr,
              ["start", "end"].includes(attr) ? parseDate(value) : value,
            ];
          })
        ),
      };
      eventRender({
        blockUid,
        summary: "No Summary",
        description: "",
        location: "",
        start: new Date(),
        end: addMinutes(new Date(), 30),
        ...props,
      });
    },
  });

  createHTMLObserver({
    tag: "TEXTAREA",
    className: "rm-block-input",
    callback: (t: HTMLTextAreaElement) => (textareaRef.current = t),
  });

  createBlockObserver((b: HTMLDivElement) => {
    const { blockUid } = getUids(b);
    if (eventUids.current.has(blockUid)) {
      const container = b.closest(".rm-block-main");
      const icon = createIconButton("edit");
      icon.style.position = "absolute";
      icon.style.top = "0";
      icon.style.right = "0";
      icon.addEventListener("click", () => {
        const calendarIds = getCalendarIds();
        Promise.all(
          calendarIds.map((c) =>
            getAccessToken(c.account).then((token) => {
              const text = getTextByBlockUid(blockUid);
              const eventId = GCAL_EVENT_REGEX.exec(text)?.[1];
              const edit = atob(eventId).split(" ")[0];
              return axios
                .get(
                  `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
                    c.calendar
                  )}/events/${edit}`,
                  { headers: { Authorization: `Bearer ${token}` } }
                )
                .then(r => ({data: r.data, calendar: c}))
                .catch(() => undefined);
            })
          )
        ).then((all) => {
          const r = all.find((r) => r);
          return eventRender({
            edit: r.data.id,
            calendar: r.calendar,
            blockUid,
            summary: r.data.summary,
            description: r.data.description,
            location: r.data.location,
            start: new Date(r.data.start.dateTime),
            end: new Date(r.data.end.dateTime),
          });
        });
      });
      container.append(icon);
    }
  });
});

registerSmartBlocksCommand({
  text: "GOOGLECALENDAR",
  handler: (context: { targetUid: string }) => () =>
    fetchGoogleCalendar(getPageTitleByBlockUid(context.targetUid)).then(
      (bullets) => {
        setTimeout(refreshEventUids, 1000);
        if (bullets.length) {
          return bullets;
        } else {
          return EMPTY_MESSAGE;
        }
      }
    ),
});
