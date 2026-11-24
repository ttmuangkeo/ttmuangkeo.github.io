// Room layout in native pixels (160x100). Furniture is decor; OBJECTS are the interactive things
// (the found counter, tray and "found everything" moment all count from this list).
// useSpot is the floor cell mini Tim walks to; face is the direction he faces while using it.

export const ROOM = {
  cols: 20, rows: 12, cell: 8,
  floorTopRow: 5,             // the floor starts at y = 40
  start: { col: 9, row: 9 },  // where Tim stands when the room opens (on the rug)
  // floor cells covered by furniture
  blocked: [
    [3, 5], [4, 5], [5, 5],                                       // bookshelf
    ...[11, 12, 13, 14, 15, 16, 17].flatMap((c) => [[c, 5], [c, 6], [c, 7]]), // desk
    [1, 9], [2, 9], [3, 9], [1, 10], [2, 10], [3, 10],            // camera bag
    [19, 8],                                                      // mailbox post
    [17, 10], [18, 10], [17, 11], [18, 11],                       // server rack
  ],
};

export const DECOR = [
  { sprite: 'rug', x: 38, y: 62, flat: true },
  { sprite: 'shelf', x: 26, y: 14 },
  { sprite: 'desk', x: 94, y: 40 },
  { sprite: 'mug', x: 128, y: 32 },
];

export const OBJECTS = [
  { id: 'pennant', label: 'Alaska pennant', sprite: 'pennant', x: 6, y: 8,
    ariaLabel: 'Alaska pennant: where it all started', useSpot: { col: 1, row: 5 }, face: 'up', anim: 'look' },
  { id: 'map', label: 'Trail map', sprite: 'map', x: 48, y: 7,
    ariaLabel: "Trail map: Tim's route from Anchorage to MoxiWorks", useSpot: { col: 8, row: 5 }, face: 'up', anim: 'unroll' },
  { id: 'laptop', label: 'Laptop', sprite: 'laptop', x: 106, y: 31,
    ariaLabel: 'Laptop: what Tim works on today', useSpot: { col: 14, row: 8 }, face: 'up', anim: 'type' },
  { id: 'pager', label: 'Pager', sprite: 'pager', x: 97, y: 33,
    ariaLabel: 'Pager: production escalations and migrations', useSpot: { col: 11, row: 8 }, face: 'up', anim: 'grab' },
  { id: 'logbook', label: 'Logbook', sprite: 'logbook', x: 33, y: 6,
    ariaLabel: "Logbook: every role, version by version", useSpot: { col: 4, row: 6 }, face: 'up', anim: 'flip' },
  { id: 'keys', label: 'Truck keys', sprite: 'keys', x: 138, y: 14,
    ariaLabel: 'Truck keys: sitrepp.io, the trip planner Tim is building', useSpot: { col: 18, row: 5 }, face: 'up', anim: 'jingle' },
  { id: 'camera', label: 'Camera bag', sprite: 'camera', x: 10, y: 72,
    ariaLabel: 'Camera bag: Summit Peak Venture and photography', useSpot: { col: 4, row: 10 }, face: 'left', anim: 'photo' },
  { id: 'rack', label: 'Server rack', sprite: 'rack', x: 136, y: 70,
    ariaLabel: 'Server rack: the EWS to Microsoft Graph cutover', useSpot: { col: 16, row: 11 }, face: 'right', anim: 'blink' },
  { id: 'mailbox', label: 'Mailbox', sprite: 'mailbox', x: 148, y: 44,
    ariaLabel: 'Mailbox: get in touch with Tim', useSpot: { col: 18, row: 9 }, face: 'up', anim: 'open' },
];
