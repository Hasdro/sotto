// The app's router reads the page path: start the side panel on the call screen, not on
// "/sidepanel.html". Runs before the app's own scripts.
if (location.pathname !== "/") history.replaceState(null, "", "/");
