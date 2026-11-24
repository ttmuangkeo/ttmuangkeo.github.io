// Office layout in native pixels (240x135). DECOR is furniture; OBJECTS are the interactive things
// (the found counter, tray and "found everything" moment all count from this list).
// useSpot is the floor cell mini Tim walks to; face is the direction he faces while using it.

const cells = (c0, c1, r0, r1) => {
  const out = [];
  for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) out.push([c, r]);
  return out;
};

export const ROOM = {
  cols: 30, rows: 16, cell: 8,
  floorTopRow: 9,              // the floor starts at y = 72
  start: { col: 12, row: 13 },  // where Tim stands when the room opens (on the rug)
  // floor cells covered by furniture
  blocked: [
    ...cells(0, 7, 9, 11),     // sofa
    ...cells(7, 8, 10, 11),    // tall plant
    ...cells(17, 25, 9, 12),   // standing desk
    ...cells(15, 16, 11, 12),  // toolbox
    ...cells(27, 29, 12, 15),  // server rack
  ],
};

export const DECOR = [
  { sprite: 'rug', x: 56, y: 106, flat: true },
  { sprite: 'sofa', x: 6, y: 74 },
  { sprite: 'plant', x: 59, y: 62 },
  { sprite: 'shelf', x: 70, y: 22 },
  { sprite: 'desk', x: 138, y: 70 },
  { sprite: 'mug', x: 142, y: 66 },
  { sprite: 'pendant', x: 155, y: 0 },
  { sprite: 'pendant', x: 177, y: 0 },
];

export const OBJECTS = [
  { id: 'pennant', label: 'Alaska pennant', sprite: 'pennant', x: 70, y: 6,
    ariaLabel: 'Alaska pennant: where it all started', useSpot: { col: 9, row: 10 }, face: 'up', anim: 'look' },
  { id: 'map', label: 'Trail map', sprite: 'map', x: 93, y: 3,
    ariaLabel: "Trail map: Tim's route from Anchorage to Seattle", useSpot: { col: 13, row: 9 }, face: 'up', anim: 'unroll' },
  { id: 'whiteboard', label: 'Whiteboard', sprite: 'whiteboard', x: 6, y: 9,
    ariaLabel: "Whiteboard: Tim's work by the numbers", useSpot: { col: 4, row: 12 }, face: 'up', anim: 'look' },
  { id: 'laptop', label: 'Dual monitors', sprite: 'laptop', x: 148, y: 56,
    ariaLabel: 'Dual monitors: the AI tools Tim builds', useSpot: { col: 21, row: 13 }, face: 'up', anim: 'type' },
  { id: 'pager', label: 'Pager', sprite: 'pager', x: 194, y: 67,
    ariaLabel: 'Pager: production escalations and migrations', useSpot: { col: 24, row: 13 }, face: 'up', anim: 'grab' },
  { id: 'logbook', label: 'Binder', sprite: 'logbook', x: 78, y: 38,
    ariaLabel: 'Binder: every role, version by version', useSpot: { col: 10, row: 9 }, face: 'up', anim: 'flip' },
  { id: 'toolbox', label: 'Toolbox', sprite: 'toolbox', x: 122, y: 89,
    ariaLabel: "Toolbox: Tim's skills and the internal tools he has built", useSpot: { col: 14, row: 12 }, face: 'right', anim: 'grab' },
  { id: 'plaque', label: 'Team photo', sprite: 'plaque', x: 122, y: 6,
    ariaLabel: 'Team photo: clients, VIP accounts and mentoring', useSpot: { col: 16, row: 10 }, face: 'up', anim: 'look' },
  { id: 'keys', label: 'Truck keys', sprite: 'keys', x: 207, y: 28,
    ariaLabel: 'Truck keys: sitrepp.io, the trip planner Tim is building', useSpot: { col: 26, row: 9 }, face: 'up', anim: 'jingle' },
  { id: 'camera', label: 'Camera', sprite: 'camera', x: 106, y: 24,
    ariaLabel: 'Camera: Summit Peak Venture and photography', useSpot: { col: 14, row: 10 }, face: 'up', anim: 'photo' },
  { id: 'rack', label: 'Server rack', sprite: 'rack', x: 220, y: 100,
    ariaLabel: 'Server rack: the EWS to Microsoft Graph cutover', useSpot: { col: 26, row: 15 }, face: 'right', anim: 'blink' },
  { id: 'mailbox', label: 'Door', sprite: 'mailbox', x: 216, y: 22,
    ariaLabel: 'Door: get in touch with Tim', useSpot: { col: 28, row: 9 }, face: 'up', anim: 'open' },
];
