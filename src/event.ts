import differenceInMinutes from "date-fns/differenceInMinutes";
import format from "date-fns/format";

const DEFAULT_DATE_FORMAT = "hh:mm a";


export type Event = {
  transparency: "transparent" | "opaque";
  summary: string;
  htmlLink: string;
  hangoutLink: string;
  location: string;
  attendees: { displayName?: string; email: string }[];
  start: { dateTime: string };
  end: { dateTime: string };
  visibility?: "private" | "public";
  calendar: string;
};

export type EventFormatterFunction = (event: Event) => string;

const customEventFormatterWrapper = (formatter: EventFormatterFunction, event:Event, defaultValue: string): string => {
  return formatter ? formatter(event) : defaultValue;
}

const resolveDate = (d: { dateTime?: string; format?: string }) => {
  if (!d?.dateTime) {
    return "All Day";
  }
  const date = new Date(d.dateTime);
  return format(date, d?.format || DEFAULT_DATE_FORMAT);
};

const resolveAttendees = (e: Event, s: string) => {
  return (e.attendees || [])
    .map((attn) =>
      (s || "NAME")
        .replace(/NAME/g, attn["displayName"] || attn["email"]))
    .join(", ");
};

const resolveSummary = (e: Event) =>
  e.visibility === "private" ? "busy" : e.summary || "No Summary";

function resolveDuration(e: Event) {
  return (e.start?.dateTime && e.end?.dateTime
      ? differenceInMinutes(
        new Date(e.end.dateTime),
        new Date(e.start.dateTime)
      )
      : 24 * 60
  ).toString();
}

export const formatEvent = (
  e: Event,
  format: string,
  includeLink: boolean,
  customFormatter?: EventFormatterFunction
): string => {
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
    return (
      (format as string)
        // begin @deprecated
        .replace("/Summary", summaryText)
        .replace("/Link", e.htmlLink || "")
        .replace("/Hangout", e.hangoutLink || "")
        .replace("/Location", e.location || "")
        .replace("/Start Time", resolveDate(e.start))
        .replace("/End Time", resolveDate(e.end))
        // end @deprecated
        .replace("{summary}", summary)
        .replace("{link}", e.htmlLink || "")
        .replace("{hangout}", e.hangoutLink || "")
        .replace("{confLink}", meetLink + zoomLink || "")
        .replace("{location}", e.location || "")
        .replace(/{attendees:?(.*?)}/, (_, format) =>
          resolveAttendees(e, format)
        )
        .replace(/{start:?(.*?)}/, (_, format) =>
          resolveDate({...e.start, format})
        )
        .replace(/{end:?(.*?)}/, (_, format) =>
          resolveDate({...e.end, format})
        )
        .replace(/{calendar}/, e.calendar)
        .replace("{duration}", resolveDuration(e))
        .replace("{custom}", (tag) => customEventFormatterWrapper(customFormatter, e, tag))
    );
  } else {
    return `${summary} (${resolveDate(e.start)} - ${resolveDate(
      e.end
    )})${meetLink}${zoomLink}`;
  }
};
