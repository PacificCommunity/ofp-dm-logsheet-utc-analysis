// See https://observablehq.com/framework/config for documentation.
export default {
  // The app's title; used in the sidebar and webpage titles.
  title: "Logsheet UTC Analysis",

  pages: [
    {name: "Summary", path: "/"},
    {name: "Set time distribution", path: "/set-time-distribution"},
    {name: "Entities to migrate", path: "/entities-to-migrate"},
    {name: "Observer offsets by vessel flag", path: "/observer-offsets"},
    {name: "Logsheet activity IANA timezone offset by vessel flag", path: "/logsheet-offsets"},
    {name: "Logsheet activity Nautical timezone offset by vessel flag", path: "/logsheet-nautical-offsets"},
    {name: "UTC offset decision tree (flag × timezone)", path: "/offset-decision-tree"},
    {name: "Observer offset distribution by EEZ", path: "/observer-offset-per-eez"},
  ],

  // Content to add to the head of the page, e.g. for a favicon:
  head: '<link rel="icon" href="observable.png" type="image/png" sizes="32x32">',

  // The path to the source root.
  root: "src",
};
