import { formatEvent, EventFormatterFunction } from "../src/event";
import { eventFactory } from "./eventFactory";
import each from 'jest-each';

const event = eventFactory();
describe("Testing a simple event on different formats (no link)", () => {
  each([
    ["", "Meditation retreat (08:00 AM - 08:30 AM) - [Meet](https://meet-link)"],
    ["__{summary}__", "__Meditation retreat__"],
    ["__{link}__", "__https://html-link__"],
    ["__{hangout}__", "__https://meet-link__"],
    ["__{location}__", "__Room 22__"],
    ["__{start}__", "__08:00 AM__"],
    ["__{end}__", "__08:30 AM__"],
    ["__{attendees}__", "__me@example.com, other@example.com__"],
    ["__{calendar}__", "__calendar@example.com__"],
    ["__{duration}__", "__30__"],
    ["__{confLink}__", "__ - [Meet](https://meet-link)__"],
  ]).test("Format event with format: %s", (format: string, expected: string) => {
    expect(formatEvent(event, format, false)).toBe(expected);
  });
});

describe("Testing a simple event on deprecated formats (no link)", () => {
  each([
    ["__/Summary__", "__Meditation retreat__"],
    ["__/Link__", "__https://html-link__"],
    ["__/Hangout__", "__https://meet-link__"],
    ["__/Location__", "__Room 22__"],
    ["__/Start Time__", "__08:00 AM__"],
    ["__/End Time__", "__08:30 AM__"],

  ]).test("Format event with format: %s", (format: string, expected: string) => {
    expect(formatEvent(event, format, false)).toBe(expected);
  });
});

describe("Test the effect of the Include Link setting", () => {
  test("Test including event link", () => {
    expect(
      formatEvent(event, "__{summary}__", true)
    ).toBe("__[Meditation retreat](https://html-link)__")
  });

  test("Test including event link does not change deprecated format", () => {
    expect(
      formatEvent(event, "__/Summary__", true)
    ).toBe("__Meditation retreat__")
  });
});

describe("Test date formatting", () => {
  each([
    ["", "2021-09-01T21:00:00+00:00", "09:00 PM"],
    ["hh:mm", "2021-09-01T21:00:00+00:00", "09:00"],
    ["HH:mm", "2021-09-01T21:00:00+00:00", "21:00"],
    ["h:mm:ss a", "2021-09-01T21:00:00+00:00", "9:00:00 PM"],
  ]).test("Test dates with formatting: %s",
    (date_format: string, date: string, expected: string) => {
      expect(
        formatEvent(eventFactory(
          {start: {dateTime: date}}), `{start:${date_format}}`, false)
      ).toBe(expected)
    });
});

describe("Test attendees formatting", () => {

  const emailEvent = event;
  const namesEvent = eventFactory({
    attendees: [
      {
        email: "me@example.com",
        displayName: "Alice Jane"
      },
      {
        email: "other@example.com",
        displayName: "Bob John"
      }
    ]
  });

  each([
    ["", "me@example.com, other@example.com"],
    ["NAME", "me@example.com, other@example.com"],
    ["[[NAME]]", "[[me@example.com]], [[other@example.com]]"],
    ["[NAME](mailto:NAME)", "[me@example.com](mailto:me@example.com), [other@example.com](mailto:other@example.com)"],
  ]).test("Test attendees (only email) with formatting: %s",
    (attendee_format: string, expected: string) => {
      expect(
        formatEvent(emailEvent, `{attendees:${attendee_format}}`, false)
      ).toBe(expected)
    });

  each([
    ["", "Alice Jane, Bob John"],
    ["NAME", "Alice Jane, Bob John"],
    ["[[NAME]]", "[[Alice Jane]], [[Bob John]]"],
  ]).test("Test attendees (with display name) with formatting: %s",
    (attendee_format: string, expected: string) => {
      expect(
        formatEvent(namesEvent, `{attendees:${attendee_format}}`, false)
      ).toBe(expected)
    });


});

describe("Test confLink formatting", () => {

  const formattedEvent = (zoom: boolean, meet: boolean) => {
    const overrides = zoom ? {location: "https://us02web.zoom.us/j/000"} : {};
    let event = eventFactory(overrides);
    if (!meet) {
      delete event.hangoutLink;
    }
    return formatEvent(event, "{confLink}", false);
  };

  each`
    label                   | has_zoom | has_meet | expected
    ${"no conference data"} | ${false} | ${false} | ${""}
    ${"both zoom and meet"} | ${true}  | ${true}  | ${" - [Meet](https://meet-link) - [Zoom](https://us02web.zoom.us/j/000)"}
    ${"zoom only"}          | ${true}  | ${false} | ${" - [Zoom](https://us02web.zoom.us/j/000)"}
    ${"meet only"}          | ${false} | ${true}  | ${" - [Meet](https://meet-link)"}
  `.test("Test confLink with $label",
    ({has_zoom, has_meet, expected}) => {
      expect(formattedEvent(has_zoom, has_meet)).toEqual(expected);
    });
});

describe( "Test custom formatter", () => {
  test("Custom formatter missing", () => {
    expect(formatEvent(event, "__{custom}__", true)).toBe("__{custom}__");
  })

  test("Custom formatter basic", () => {
    const customFormatter: EventFormatterFunction = e => e.summary;
    expect(formatEvent(event, "__{custom}__", true, customFormatter))
      .toBe("__Meditation retreat__");
  })

  test("Custom formatter mixed", () => {
    const customFormatter: EventFormatterFunction = e => e.start.dateTime;
    expect(formatEvent(event, "__{summary}__{custom}__", false, customFormatter))
      .toBe(`__Meditation retreat__${event.start.dateTime}__`);
  })

  test("Custom formatter advanced attendees", () => {
    const customFormatter: EventFormatterFunction = e => {
      const contacts: {[key: string]: string} = {
        "me@example.com": "Alice Jane",
        "other@example.com": "Bob John"
      };
      return (e.attendees || [])
        .map(attn => `[[People/${contacts[attn.email] || attn.email}]]`)
        .join(", ")
    }
    expect(formatEvent(event, "{summary} with {custom}", false, customFormatter))
      .toBe(`Meditation retreat with [[People/Alice Jane]], [[People/Bob John]]`);
  })
});