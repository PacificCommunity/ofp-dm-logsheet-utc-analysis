// See https://observablehq.com/framework/config for documentation.
export default {
  // The app's title; used in the sidebar and webpage titles.
  title: "Logsheet UTC Analysis",

  pages: [
    {name: "Problem & method", path: "/"},
    {name: "Purseseine set time", path: "/ps-set-time-distribution"},
    {name: "Longline set time distribution", path: "/ll-set-time-distribution"},
    {name: "Observer coverage", path: "/observer-coverage"},
    {name: "Observer & nautical offsets", path: "/observer-offsets"},
    {name: "International waters", path: "/international-waters"},
    {name: "Decision tree", path: "/decision-tree"},
  ],

  // Content to add to the head of the page, e.g. for a favicon:
  head: '<link rel="icon" href="observable.png" type="image/png" sizes="32x32">',

  // The path to the source root.
  root: "src",

  // Use the Python 3.12 interpreter that has pandas/pyodbc/scikit-learn installed
  // (the default `python3` on this machine resolves to a different interpreter).
  interpreters: {
    ".py": ["python"],
  },
};
