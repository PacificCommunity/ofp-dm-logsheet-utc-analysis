// See https://observablehq.com/framework/config for documentation.
export default {
  // The app's title; used in the sidebar and webpage titles.
  title: "Logsheet UTC Analysis",

  pages: [
    {name: "Summary", path: "/"},
    {name: "Purseseine set time", path: "/ps-set-time-distribution"},
    {name: "Longline set time distribution", path: "/ll-set-time-distribution"},
    {name: "Longline offset complexity per flag", path: "/observer-offset-per-flag"},
    {name: "EEZ combinations per trip", path: "/eez-list-per-trip"},
    {name: "Observer offset by vessel flag", path: "/observer-offsets"},
    {name: "Observer offset by EEZ", path: "/observer-offset-per-eez"},
    {name: "Decision tree", path: "/decision-tree"},
  ],

  // Content to add to the head of the page, e.g. for a favicon:
  head: '<link rel="icon" href="observable.png" type="image/png" sizes="32x32">',

  // The path to the source root.
  root: "src",
};
