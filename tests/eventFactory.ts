import { Event } from "../src/event";

const EVENT_TEMPLATE: Event = {
  attendees: [
    {
      email: "me@example.com"
    },
    {
      email: "other@example.com"
    },
  ],
  calendar: "calendar@example.com",
  start: {dateTime: "2021-09-01T09:00:00+01:00"},
  end: {dateTime: "2021-09-01T09:30:00+01:00"},
  hangoutLink: "https://meet-link",
  htmlLink: "https://html-link",
  location: "Room 22",
  summary: "Meditation retreat",
  transparency: "transparent",
};

export const eventFactory = (overrides: Partial<Event> = {}): Event => {
  return {...EVENT_TEMPLATE, ...overrides};
}