# To-do list

Ideas and requests from the director. Newest at the bottom; mark done with the version that shipped it.

- [x] Small sound effects now and then (every 20-30 s, never over speech): laptop typing, mouse clicks, a chair creak, game bleeps, a page turning, the TV remote, sizzling pan, glasses clinking, crunching, sipping, footsteps, phone buzz, snoring, heavy breathing on the treadmill, and Falafel barking when he's around. — v113
- [x] Sound effects must never cut into speech: they wait until nobody is talking (voices, typed lines, the gaps in a conversation, the DJ). — v114
- [ ] Picture-in-picture "pop out" button: use the Document Picture-in-Picture API where available (Chrome/Edge desktop: a small always-on-top window with the canvas, live speech bubbles and a host line or two); elsewhere fall back to video PiP from `canvas.captureStream()` into a hidden `<video>` (Chrome, Edge, Safari; bubbles drawn into the copied picture since HTML overlays don't show). No server streaming needed; sound keeps playing from the page. Firefox can't start PiP from a page, so hide the button there.
