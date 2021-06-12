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
  createCustomSmartBlockCommand,
  runExtension,
  localStorageGet,
  localStorageSet,
  localStorageRemove,
  getPageUidByPageTitle,
  addRoamJSDependency,
} from "roam-client";
import axios from "axios";
import formatRFC3339 from "date-fns/formatRFC3339";
import startOfDay from "date-fns/startOfDay";
import endOfDay from "date-fns/endOfDay";
import format from "date-fns/format";
import { createConfigObserver, getOauth } from "roamjs-components";
import differenceInSeconds from "date-fns/differenceInSeconds";
// import { getRenderRoot } from "../components/hooks";
// import { render } from "../components/DeprecationWarning";

addRoamJSDependency("google");

export const getAccessToken = () => {
  const legacyOauth = getOauth("google-calendar");
  const isLegacy = legacyOauth && legacyOauth !== "{}";
  const oauth = isLegacy ? legacyOauth : getOauth("google");
  if (oauth !== "{}") {
    const { access_token, expires_in, refresh_token, node } = JSON.parse(oauth);
    const { time, uid: oauthUid } = node || {};
    const tokenAge = differenceInSeconds(
      new Date(),
      time ? new Date(time) : new Date(0)
    );
    return tokenAge > expires_in
      ? axios
          .post(`https://lambda.roamjs.com/google-auth`, {
            refresh_token,
            grant_type: "refresh_token",
          })
          .then((r) => {
            const storageData = localStorageGet(
              isLegacy ? "oauth-google-calendar" : "oauth-google"
            );
            const data = JSON.stringify({ refresh_token, ...r.data });
            if (storageData) {
              if (isLegacy) {
                localStorageRemove("oauth-google-calendar");
              }
              localStorageSet(
                "oauth-google",
                JSON.stringify(
                  JSON.parse(storageData).map(
                    (at: { uid: string; text: string }) =>
                      at.uid === oauthUid
                        ? {
                            uid: at.uid,
                            data,
                            time: new Date().valueOf(),
                            text: at.text,
                          }
                        : at
                  )
                )
              );
            } else {
              window.roamAlphaAPI.updateBlock({
                block: {
                  uid: oauthUid,
                  string: data,
                },
              });
              if (isLegacy) {
                const parentUid = getPageUidByPageTitle("roam/js/google");
                const uid = createBlock({
                  parentUid,
                  node: { text: "oauth" },
                });
                window.roamAlphaAPI.moveBlock({
                  location: { "parent-uid": uid, order: 0 },
                  block: { uid: oauthUid },
                });
              }
            }
            return r.data.access_token;
          })
      : Promise.resolve(access_token);
  } else {
    return Promise.resolve("");
  }
};

const GOOGLE_COMMAND = "Import Google Calendar";

type Event = {
  transparency: "transparent" | "opaque";
  summary: string;
  htmlLink: string;
  hangoutLink: string;
  location: string;
  attendees: { displayName: string; email: string }[];
  start: { dateTime: string };
  end: { dateTime: string };
  visibility: "private" | "public";
};

const EMPTY_MESSAGE = "No Events Scheduled for Today!";
const CONFIG = "roam/js/google-calendar";
const textareaRef: { current: HTMLTextAreaElement } = {
  current: null,
};

const resolveDate = (d: { dateTime?: string; format?: string }) => {
  if (!d?.dateTime) {
    return "All Day";
  }
  const date = new Date(d.dateTime);
  if (d.format) {
    return format(date, d.format);
  } else {
    return date.toLocaleTimeString();
  }
};

const resolveAttendees = (e: Event) => {
  const attendessListString = (e.attendees || [])
    .map((attn) => `[[${attn["displayName"] || attn["email"]}]]`)
    .join(", ");

  return attendessListString;
};

const resolveSummary = (e: Event) =>
  e.visibility === "private" ? "busy" : e.summary || "No Summary";

const fetchGoogleCalendar = async (): Promise<string[]> => {
  const pageTitle = getPageTitleByHtmlElement(document.activeElement);
  const dateFromPage = parseRoamDate(pageTitle.textContent);

  const legacyConfig = getConfigFromPage(CONFIG);
  const configTree = getTreeByPageName(CONFIG);
  const Authorization = await getAccessToken();
  if (!Authorization) {
    return [`Error: Must log in to Google through the [[roam/js/google]] page`];
  }
  const importTree = configTree.find((t) => /import/i.test(t.text));

  const calendarIds =
    importTree?.children
      ?.find?.((t) => /calendars/i.test(t.text))
      ?.children?.map((c) => c.text) ||
    [legacyConfig["Google Calendar"]?.trim()]
      .filter((s) => !!s)
      .map((s) => s as string);
  if (!calendarIds.length) {
    return [
      `Error: Could not find a calendar to import on the [[${CONFIG}]] page.`,
    ];
  }
  const includeLink =
    importTree?.children?.some?.((t) => /include event link/i.test(t.text)) ||
    legacyConfig["Include Event Link"]?.trim() === "true";
  const skipFree =
    importTree?.children?.some?.((t) => /skip free/i.test(t.text)) ||
    legacyConfig["Skip Free"]?.trim() === "true";
  const format =
    importTree?.children
      ?.find?.((t) => /format/i.test(t.text))
      ?.children?.[0]?.text?.trim?.() || legacyConfig["Format"]?.trim?.();
  const dateToUse = isNaN(dateFromPage.valueOf()) ? new Date() : dateFromPage;
  const timeMin = startOfDay(dateToUse);
  const timeMax = endOfDay(timeMin);
  const timeMinParam = encodeURIComponent(formatRFC3339(timeMin));
  const timeMaxParam = encodeURIComponent(formatRFC3339(timeMax));

  return Promise.all(
    calendarIds.map((calendarId) =>
      axios
        .get<{
          items: Event[];
        }>(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
            calendarId
          )}/events?timeMin=${timeMinParam}&timeMax=${timeMaxParam}&orderBy=startTime&singleEvents=true`,
          {
            headers: {
              Authorization: `Bearer ${Authorization}`,
            },
          }
        )
        .then((r) => ({ items: r.data.items, calendar: calendarId, error: "" }))
        .catch((e) => ({
          items: [] as Event[],
          calendar: calendarId,
          error: `Error for calendar ${calendarId}: ${
            e.response?.data?.error?.message ===
            "Request failed with status code 404"
              ? `Could not find calendar or it's not public. For more information on how to make it public, [visit this page](https://roamjs.com/extensions/google-calendar)`
              : (e.response?.data?.error?.message as string)
          }`,
        }))
    )
  )
    .then((rs) => ({
      events: rs
        .flatMap((r) => r.items.map((i) => ({ ...i, calendar: r.calendar })))
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
    .then(async ({ events, errors }) => {
      if (!events || events.length === 0) {
        return [EMPTY_MESSAGE, ...errors];
      }
      return [
        ...events
          .filter((e: Event) => !skipFree || e.transparency !== "transparent")
          .map((e: Event) => {
            const summaryText = resolveSummary(e);
            const summary =
              includeLink && e.htmlLink
                ? `[${summaryText}](${e.htmlLink})`
                : summaryText;
            const meetLink = e.hangoutLink ? ` - [Meet](${e.hangoutLink})` : "";
            const zoomLink =
              e.location && e.location.indexOf("zoom.us") > -1
                ? ` - [Zoom](${e.location})`
                : "";
            if (format) {
              return (format as string)
                .replace("/Summary", resolveSummary(e))
                .replace("/Link", e.htmlLink || "")
                .replace("/Hangout", e.hangoutLink || "")
                .replace("/Location", e.location || "")
                .replace("/Start Time", resolveDate(e.start))
                .replace("/End Time", resolveDate(e.end))
                .replace("{summary}", summary)
                .replace("{link}", e.htmlLink || "")
                .replace("{hangout}", e.hangoutLink || "")
                .replace("{confLink}", meetLink + zoomLink || "")
                .replace("{location}", e.location || "")
                .replace("{attendees}", resolveAttendees(e) || "")
                .replace(/{start:?(.*?)}/, (_, format) =>
                  resolveDate({ ...e.start, format })
                )
                .replace(/{end:?(.*?)}/, (_, format) =>
                  resolveDate({ ...e.end, format })
                );
            } else {
              return `${summary} (${resolveDate(e.start)} - ${resolveDate(
                e.end
              )})${meetLink}${zoomLink}`;
            }
          }),
        ...errors,
      ];
    });
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
  fetchGoogleCalendar().then((bullets) =>
    pushBullets(bullets, blockUid, parentUid)
  );
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
  const parentUid = getCurrentPageUid();
  const blockUid = loadBlockUid(parentUid);
  return fetchGoogleCalendar().then((bullets) => {
    pushBullets(bullets, blockUid, getParentUidByBlockUid(blockUid));
  });
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
              type: "multitext",
              title: "calendars",
              description:
                'The calendar ids to import events from. To find your calendar id, go to your calendar settings and scroll down to "Integrate Calendar".',
              defaultValue: ["dvargas92495@gmail.com"],
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
              type: "text",
              title: "format",
              description:
                "The format events should output in when imported into Roam",
            },
          ],
        },
      ],
    },
  });

  addButtonListener(GOOGLE_COMMAND, importGoogleCalendar);
  window.roamAlphaAPI.ui.commandPalette.addCommand({
    label: "Import Google Calendar",
    callback: importGoogleCalendarCommand,
  });

  createHTMLObserver({
    tag: "TEXTAREA",
    className: "rm-block-input",
    callback: (t: HTMLTextAreaElement) => (textareaRef.current = t),
  });
});

createCustomSmartBlockCommand({
  command: "GOOGLECALENDAR",
  processor: async () =>
    fetchGoogleCalendar().then(async (bullets) => {
      if (bullets.length) {
        bullets.forEach((s) =>
          window.roam42.smartBlocks.activeWorkflow.outputAdditionalBlock(s)
        );
        return "";
      } else {
        return EMPTY_MESSAGE;
      }
    }),
});
