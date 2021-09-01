import { Event, formatEvent } from "../src/event";

const eventMaker = (): Event => {
  return {
    attendees: [
      {
        "email": "person@example.com"
      },
    ],
    calendar: "calendar@example.com",
    end: {dateTime: "2021-09-01T09:00:00+01:00"},
    hangoutLink: "https://meet-link",
    htmlLink: "https://html-link",
    location: "",
    start: {dateTime: "2021-09-06T09:30:00+01:00"},
    summary: "Meditation retreat",
    transparency: "transparent",
  };
}

test("Format Event Default Format", () => {
  expect(formatEvent(eventMaker(), '', true)
  ).toBe("[Meditation retreat](https://html-link) (9:30:00 AM - 9:00:00 AM) - [Meet](https://meet-link)");
});

