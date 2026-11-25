// Office layout in world units (1 unit = 1 sprite pixel). x runs 0 (left wall) to 240,
// z runs 0 (back wall) to 112 toward the camera, y runs 0 (floor) to 72 (top of the walls).
// DECOR is furniture; OBJECTS are the interactive things (the found counter, tray and
// "found everything" moment all count from this list).
// useSpot is the floor cell Tim walks to; face is the direction he faces while using it.
// `at` places the piece:
//   { on: 'back', x, y, z?, d? }  flat on the back wall; y is measured down from the top of the wall
//   { on: 'left', z, y }          flat on the left wall, facing the room
//   { on: 'floor', x, z, d }      a box standing on the floor, back-left corner at (x, z), d deep
//   { on: 'desk', x, z, d }       the same, standing on the desk top
//   { on: 'hang', x, z }          hanging from the top of the wall (pendant lights)

const cells = (c0, c1, r0, r1) => {
  const out = [];
  for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) out.push([c, r]);
  return out;
};

export const ROOM = {
  cols: 30, rows: 14, cell: 8,
  deskTop: 30,                  // the desk sprite's white top is 30 units off the floor
  start: { col: 13, row: 7 },   // on the rug, straight below the trail map
  // floor cells covered by furniture
  blocked: [
    ...cells(17, 25, 0, 2),     // standing desk under the window
    ...cells(0, 6, 5, 7),       // sofa along the left wall
    ...cells(7, 8, 6, 6),       // tall plant
    ...cells(16, 17, 3, 4),     // toolbox
    ...cells(27, 28, 11, 12),   // server rack
  ],
};

// The walkable cell in front of the window, where Tim stops to watch the rain.
export const WINDOW_SPOT = { col: 19, row: 3 };

export const DECOR = [
  { sprite: 'rug', at: { on: 'floor', x: 60, z: 56, d: 24 }, flat: true },
  { sprite: 'sofa', at: { on: 'floor', x: 0, z: 44, d: 14 } },
  { sprite: 'plant', at: { on: 'floor', x: 56, z: 48, d: 8 }, billboard: true },
  { sprite: 'shelf', at: { on: 'back', x: 70, y: 22 } },
  { sprite: 'desk', at: { on: 'floor', x: 138, z: 0, d: 20 } },
  { sprite: 'mug', at: { on: 'desk', x: 140, z: 10, d: 4 } },
  { sprite: 'pendant', at: { on: 'hang', x: 158, z: 10 } },
  { sprite: 'pendant', at: { on: 'hang', x: 180, z: 10 } },
];

export const OBJECTS = [
  { id: 'pennant', label: 'Alaska pennant', sprite: 'pennant', at: { on: 'back', x: 70, y: 6 },
    ariaLabel: 'Alaska pennant: where it all started', useSpot: { col: 8, row: 0 }, face: 'up', anim: 'look' },
  { id: 'map', label: 'Trail map', sprite: 'map', at: { on: 'back', x: 93, y: 3 },
    ariaLabel: "Trail map: Tim's route from Anchorage to Seattle", useSpot: { col: 13, row: 0 }, face: 'up', anim: 'unroll' },
  { id: 'whiteboard', label: 'Whiteboard', sprite: 'whiteboard', at: { on: 'back', x: 6, y: 9 },
    ariaLabel: "Whiteboard: Tim's work by the numbers", useSpot: { col: 4, row: 0 }, face: 'up', anim: 'look' },
  { id: 'laptop', label: 'Dual monitors', sprite: 'laptop', at: { on: 'desk', x: 148, z: 4, d: 4 },
    ariaLabel: 'Dual monitors: the AI tools Tim builds', useSpot: { col: 21, row: 3 }, face: 'up', anim: 'type',
    above: 1 }, // stacks over the pager's padded hit area so a tap on the monitors opens the monitors
  { id: 'pager', label: 'Pager', sprite: 'pager', at: { on: 'desk', x: 196, z: 12, d: 4 },
    ariaLabel: 'Pager: production escalations and migrations', useSpot: { col: 24, row: 3 }, face: 'up', anim: 'grab' },
  { id: 'logbook', label: 'Binder', sprite: 'logbook', at: { on: 'back', x: 78, y: 38, z: 1, d: 6 },
    ariaLabel: 'Binder: every role, version by version', useSpot: { col: 10, row: 1 }, face: 'up', anim: 'flip' },
  { id: 'toolbox', label: 'Toolbox', sprite: 'toolbox', at: { on: 'floor', x: 129, z: 26, d: 8 },
    ariaLabel: "Toolbox: Tim's skills and the internal tools he has built", useSpot: { col: 16, row: 5 }, face: 'up', anim: 'grab' },
  { id: 'plaque', label: 'Team photo', sprite: 'plaque', at: { on: 'back', x: 122, y: 6 },
    ariaLabel: 'Team photo: clients, VIP accounts and mentoring', useSpot: { col: 16, row: 0 }, face: 'up', anim: 'look' },
  { id: 'keys', label: 'Truck keys', sprite: 'keys', at: { on: 'back', x: 207, y: 28 },
    ariaLabel: 'Truck keys: sitrepp.io, the trip planner Tim is building', useSpot: { col: 26, row: 0 }, face: 'up', anim: 'jingle' },
  { id: 'camera', label: 'Camera', sprite: 'camera', at: { on: 'back', x: 106, y: 24, z: 1, d: 8 },
    ariaLabel: 'Camera: Summit Peak Venture and photography', useSpot: { col: 14, row: 2 }, face: 'up', anim: 'photo' },
  { id: 'rack', label: 'Server rack', sprite: 'rack', at: { on: 'floor', x: 216, z: 88, d: 16 },
    ariaLabel: 'Server rack: the EWS to Microsoft Graph cutover', useSpot: { col: 26, row: 11 }, face: 'right', anim: 'blink' },
  { id: 'mailbox', label: 'Door', sprite: 'mailbox', at: { on: 'back', x: 216, y: 22 },
    ariaLabel: 'Door: get in touch with Tim', useSpot: { col: 29, row: 0 }, face: 'up', anim: 'open' },
];
