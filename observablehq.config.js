// See https://observablehq.com/framework/config for documentation.
export default {
  // The app's title; used in the sidebar and webpage titles.
  title: "Logsheet UTC Analysis",

  pages: [
    {name: "Summary", path: "/"},
    {name: "Set time distribution", path: "/set-time-distribution"},
    {name: "Observer offsets by vessel flag", path: "/observer-offsets"},
    {name: "Logsheet activity IANA timezone offset by vessel flag", path: "/logsheet-offsets"},
    {name: "Logsheet activity Nautical timezone offset by vessel flag", path: "/logsheet-nautical-offsets"},
  ],

  // Content to add to the head of the page, e.g. for a favicon:
  head: '<link rel="icon" href="observable.png" type="image/png" sizes="32x32">',

  // The path to the source root.
  root: "src",
};
