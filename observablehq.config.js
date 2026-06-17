// See https://observablehq.com/framework/config for documentation.
export default {
  // The app's title; used in the sidebar and webpage titles.
  title: "Logsheet UTC Analysis",

  pages: [
    {name: "Summary", path: "/"},
    {name: "Set time distribution", path: "/set-time-distribution"},
    {name: "Set time — UTC or local?", path: "/set-time-utc-detection"},
    {name: "Entities to migrate", path: "/entities-to-migrate"},
    {name: "Observer offsets by vessel flag", path: "/observer-offsets"},
    {name: "Logsheet activity IANA timezone offset by vessel flag", path: "/logsheet-offsets"},
    {name: "Logsheet activity Nautical timezone offset by vessel flag", path: "/logsheet-nautical-offsets"},
    {name: "Observer offset distribution by EEZ", path: "/observer-offset-per-eez"},
    {name: "Observer offset distribution by vessel flag", path: "/observer-offset-per-flag"},
    {name: "Observer offset per instance source", path: "/observer-offset-per-logsheet"},
    {name: "EEZ combinations per trip", path: "/eez-list-per-trip"},
    {name: "UTC offset predictions", path: "/utc-offset-predictions"},
    {name: "Bayesian estimator — how it works", path: "/bayesian-estimator-explained"},
  ],

  // Content to add to the head of the page, e.g. for a favicon:
  head: '<link rel="icon" href="observable.png" type="image/png" sizes="32x32">',

  // The path to the source root.
  root: "src",
};
