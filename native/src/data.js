// Every beat is a data row on the one story machine (design rule 2). Full
// chain, all twelve: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10 -> 11
// -> 12. `drone` sets the ambient base frequency per beat (audio.js) - low
// and tense through the castle, warmer once the color returns.
export const BEATS = [
  {
    id: 'prologue', bg: 'forest', music: 'wonder',
    cutscene: {
      fx: 'bloom', hold: 3.4,
      lines: [
        'Before the first winter, light had seven colours.',
        'Six of them the world was allowed to keep.',
        'The seventh lived in the horn of a unicorn, and nowhere else.',
        'Darkness wanted a night that no morning could argue with.',
      ],
    },
    next: 'shadow-council',
  },
  {
    id: 'shadow-council', bg: 'shadow-council', music: 'shadow',
    card: ['The Shadow Council', 'a castle that eats its own light'],
    faces: [{ key: 'darkness', x: 160, y: 62, scale: 1 }],
    dialogue: [
      { who: 'darkness', text: 'Winter answers to no one but me.' },
      { who: 'darkness', text: 'Let them search. The light I took will not be found.' },
    ],
    next: 'jacks-glade',
  },
  {
    id: 'jacks-glade', bg: 'glade', music: 'wonder',
    card: ["Jack's Glade", 'a moonlit clearing, that same night'],
    faces: [{ key: 'jack', x: 96, y: 68, scale: .72 }, { key: 'lili', x: 220, y: 64, scale: .72, blind: 3 }],
    dialogue: [
      { who: 'lili', text: 'You hide better than any fox, Jack.' },
      { who: 'jack', text: 'The forest tells me when you are near.' },
      { who: 'lili', text: 'Then show me what it has been whispering about.' },
      { who: 'lili', text: 'A blindfold is a strange gift for a princess.' },
      { who: 'jack', text: 'Trust the hand, not the road.' },
    ],
    next: 'unicorn-stream',
  },
  {
    id: 'unicorn-stream', bg: 'stream', music: 'wonder',
    faces: [{ key: 'jack', x: 30, y: 58, scale: .48 }, { key: 'lili', x: 84, y: 58, scale: .48, blind: 0 }],
    dialogue: [
      { who: 'jack', text: 'Keep still. They come to the water at moonrise.' },
      { who: 'lili', text: 'I only want them to know I mean no harm.' },
    ],
    game: 'stillness', g: {},
    gamePrompt: 'Three of them, three rhythms. Wait for the moment they agree.',
    successDialogue: [
      { who: 'lili', text: 'It let me touch it. Jack, it let me -' },
    ],
    cutscene: {
      fx: 'shatter', hold: 3.2,
      lines: [
        'A hidden bow answers first.',
        'The horn breaks. The seventh colour goes out of the world.',
        'And the cold comes in behind it, and keeps coming.',
      ],
    },
    next: 'winter-comes',
  },
  {
    id: 'winter-comes', bg: 'pond', music: 'winter',
    cutscene: {
      fx: 'snow', hold: 3.2,
      lines: [
        'By morning the stream had forgotten how to move.',
        'Snow took the glade, then the road, then the year.',
        'And somewhere beneath it, Lili was already gone.',
      ],
    },
    next: 'winter-falls',
  },
  {
    id: 'winter-falls', bg: 'pond', music: 'winter',
    card: ['The Frozen Pond', 'beneath sealed ice'],
    faces: [{ key: 'jack', x: 74, y: 62, scale: .72 }],
    dialogue: [
      { who: 'jack', text: "Lili? The ice wasn't broken when we crossed." },
      { who: 'jack', text: 'Something pulled her under the frost.' },
    ],
    game: 'crack', g: { cells: 7, scramble: 5 },
    gamePrompt: 'Every pane must break. A strike splits its neighbours too.',
    successDialogue: [
      { who: 'jack', text: 'The ice breaks - but her footprints end here.' },
    ],
    next: 'hollow-armory',
  },
  {
    id: 'hollow-armory', bg: 'roots', music: 'trail',
    card: ["The Champion's Hollow", 'three root-bound alcoves'],
    faces: [{ key: 'gump', x: 84, y: 70, scale: .64 }, { key: 'jack', x: 232, y: 66, scale: .68 }],
    dialogue: [
      { who: 'gump', text: 'Three alcoves. Three kinds of courage.' },
      { who: 'gump', text: 'Shadow fears no blade. It fears light shown where it hides.' },
    ],
    choice: {
      question: 'What will you carry against living shadow?',
      options: ['Thorn Blade', 'Mirror Buckler', 'Bell Seed'],
      correct: 1,
      retry: 'Blades cut vines; seeds wake roots. Neither opens a road through dark.',
    },
    successDialogue: [
      { who: 'jack', text: 'The buckler. Small, bright, and stubborn - like its bearer.' },
    ],
    next: 'rescue-vow',
  },
  {
    id: 'rescue-vow', bg: 'roots', music: 'shadow',
    faces: [{ key: 'gump', x: 88, y: 72, scale: .62 }, { key: 'jack', x: 228, y: 66, scale: .68 }],
    dialogue: [
      { who: 'gump', text: 'The hoofprints turn north - but another trail was dragged beside them.' },
      { who: 'gump', text: "Lili's winter garland. Cut by a goblin blade." },
      { who: 'jack', text: 'I led her to wonder, then left her to shadow.' },
      { who: 'gump', text: 'Guilt is a chain. Choice is a road.' },
      { who: 'jack', text: 'Then we take the road. We bring her home.' },
    ],
    next: 'bog-road',
  },
  {
    id: 'bog-road', bg: 'bog', music: 'marsh',
    card: ['The Bog Road', 'a causeway through the marsh'],
    faces: [{ key: 'gump', x: 32, y: 66, scale: .58 }, { key: 'jack', x: 284, y: 62, scale: .66 }],
    dialogue: [
      { who: 'gump', text: 'Three warning lights guard the causeway.' },
      { who: 'gump', text: 'Silence them out of order and the bog wakes.' },
    ],
    game: 'lights', g: { lights: 4 },
    gamePrompt: 'Name an order. The bog will say how many you placed right.',
    successDialogue: [
      { who: 'gump', text: 'The bog sleeps. Onward, before it stirs again.' },
    ],
    next: 'megs-looking-glass',
  },
  {
    id: 'megs-looking-glass', bg: 'cottage', music: 'marsh',
    card: ["Meg's Looking Glass", 'the cottage in the reeds'],
    faces: [{ key: 'meg', x: 274, y: 52, scale: .66 }, { key: 'jack', x: 44, y: 66, scale: .58 }],
    dialogue: [
      { who: 'meg', text: 'What soft little champion wanders into my supper?' },
      { who: 'jack', text: 'One too humble for a lady as magnificent as you.' },
      { who: 'meg', text: 'Magnificent? Say that again, morsel.' },
    ],
    game: 'dungeon', g: {
      cols: 9, rows: 2, entry: 6, target: [1, 1], mirrors: 1,
      shafts: [[6, 1]], face: 'meg', faceScale: .2,
    },
    gamePrompt: 'Moonlight through the roof. Bounce it onto Meg.',
    successDialogue: [
      { who: 'jack', text: 'My knees shook. My hand did not.' },
    ],
    next: 'root-door',
  },
  {
    id: 'root-door', bg: 'roots', music: 'castle',
    card: ['The Root Door', 'the way down'],
    faces: [{ key: 'gump', x: 92, y: 70, scale: .68 }, { key: 'jack', x: 214, y: 78, scale: .7 }],
    dialogue: [
      { who: 'gump', text: 'Four stone mouths, and nowhere onward.' },
      { who: 'jack', text: 'Then we listen for the one that breathes.' },
    ],
    choice: {
      question: 'Which door leads down into the dark castle?',
      options: ['The mouth that hums', 'The mouth that is silent', 'The mouth that weeps'],
      correct: 0,
      retry: 'Silence and grief lead nowhere. Follow what still breathes.',
    },
    successDialogue: [
      { who: 'gump', text: 'Down, then. And quietly.' },
    ],
    next: 'gown-that-breathes',
  },
  {
    id: 'gown-that-breathes', bg: 'hall', music: 'castle',
    card: ['The Gown That Breathes', 'inside the dark castle'],
    faces: [
      { key: 'darkness', x: 232, y: 56, scale: .68 },
      { key: 'lili', x: 88, y: 62, scale: .68 },
    ],
    dialogue: [
      { who: 'darkness', text: 'The castle prepared a shape for your grief.' },
      { who: 'lili', text: 'An empty dress cannot decide who wears whom.' },
      { who: 'darkness', text: 'Step inside, and every frightened heart will kneel.' },
    ],
    choice: {
      question: "How can she learn the gown's purpose without surrendering?",
      options: ['Tear the gown', 'Wear it; keep watch', 'Call for Jack'],
      correct: 1,
      retry: 'Rage and rescue both yield control. Choose watchful courage.',
    },
    successDialogue: [
      { who: 'lili', text: 'The living folds close. I keep one hand free.' },
    ],
    next: 'hidden-hand',
  },
  {
    id: 'hidden-hand', bg: 'throne', music: 'throne',
    faces: [
      { key: 'darkness', x: 226, y: 56, scale: .74 },
      { key: 'jack', x: 96, y: 78, scale: .66 },
    ],
    dialogue: [
      { who: 'darkness', text: 'Stand beside me. The night can be yours to keep.' },
      { who: 'jack', text: 'I have seen what your forever costs.' },
    ],
    choice: {
      question: 'What does Jack choose?',
      options: ['Power without dawn', 'A living world', 'A final duel'],
      correct: 1,
      retry: 'Darkness feeds on pride. Refuse his whole world, not half of it.',
    },
    successDialogue: [
      { who: 'jack', text: 'Dawn needs no throne.' },
    ],
    next: 'false-sacrifice',
  },
  {
    id: 'false-sacrifice', bg: 'throne', music: 'throne',
    faces: [
      { key: 'darkness', x: 226, y: 56, scale: .74 },
      { key: 'lili', x: 96, y: 78, scale: .66 },
    ],
    dialogue: [
      { who: 'darkness', text: 'Yield the boy, princess, and the frost spares him.' },
      { who: 'lili', text: 'You cannot trade a threat for a hostage I refuse to be.' },
    ],
    choice: {
      question: 'How does Lili answer?',
      options: ['Offer herself instead', 'Call his bluff', 'Beg for mercy'],
      correct: 1,
      retry: 'Bargains and pleading both hand him the win. Name the lie.',
    },
    successDialogue: [
      { who: 'lili', text: 'There was never a frost that needed my surrender.' },
    ],
    next: 'final-beam',
  },
  {
    id: 'final-beam', bg: 'throne', music: 'throne',
    faces: [
      { key: 'darkness', x: 278, y: 50, scale: .58 },
      { key: 'jack', x: 42, y: 66, scale: .56 },
    ],
    dialogue: [
      { who: 'jack', text: 'Meg taught me something about mirrors and vanity.' },
      { who: 'darkness', text: 'A parlor trick will not unmake me, child.' },
    ],
    game: 'dungeon', g: {
      cols: 11, rows: 4, entry: 9, target: [1, 3], mirrors: 4,
      shafts: [[9, 1], [6, 2], [7, 3]],
      blocks: [[9, 2], [4, 1]],
      guards: [[1, 1, 7, .34, 0], [2, 2, 9, .27, 1.1]],
    },
    gamePrompt: 'Carry the sun down to him - and open the shaft only once.',
    successDialogue: [
      { who: 'jack', text: 'You were never the night. You were only its shadow.' },
    ],
    next: 'edge-of-world',
  },
  {
    id: 'edge-of-world', bg: 'causeway', music: 'pursuit',
    card: ['The Edge of the World', 'the causeway, falling'],
    faces: [{ key: 'jack', x: 160, y: 70, scale: .75 }],
    dialogue: [
      { who: 'jack', text: 'The floor is giving way behind us!' },
      { who: 'jack', text: "Don't stop - jump where the light still holds." },
    ],
    successDialogue: [
      { who: 'jack', text: 'Clear. The castle groans shut behind us.' },
    ],
    cutscene: {
      fx: 'dark', hold: 3.2,
      lines: [
        'Behind them the causeway folded quietly into itself.',
        'The castle brought its own roof down rather than let them leave.',
      ],
    },
    next: 'spring-remembers',
  },
  {
    id: 'spring-remembers', bg: 'stream', music: 'wonder',
    card: ['Spring Remembers', 'the stream, unfrozen'],
    faces: [{ key: 'gump', x: 40, y: 60, scale: .5 }, { key: 'jack', x: 40, y: 116, scale: .5 }, { key: 'unicorn', x: 278, y: 118, scale: .42 }],
    dialogue: [
      { who: 'gump', text: 'The stallion still waits beneath the winter spell.' },
      { who: 'jack', text: 'Then the stolen light must remember where it belongs.' },
    ],
    choice: {
      question: 'The light is loose in the world again. What does Jack do with it?',
      options: ['Keep it safe', 'Give it back to the horn', 'Divide it among them'],
      correct: 1,
      retry: 'It was never his to keep or to share. It has an owner.',
    },
    successDialogue: [
      { who: 'gump', text: 'The stallion rises. Spring has found the forest again.' },
    ],
    next: 'seventh-color',
  },
  {
    id: 'seventh-color', bg: 'forest', music: 'wonder',
    faces: [
      { key: 'jack', x: 108, y: 62, scale: .68 },
      { key: 'lili', x: 212, y: 62, scale: .68 },
      { key: 'unicorn', x: 280, y: 108, scale: .32 },
    ],
    dialogue: [
      { who: 'lili', text: 'The forest remembers spring - and I remember your hand.' },
      { who: 'jack', text: 'Winter is gone. One promise remains to make.' },
    ],
    choice: {
      question: 'What will Jack become to the living wood?',
      options: ['Its crowned master', 'Its listening guardian', 'A wanderer beyond it'],
      correct: 1,
      retry: 'The forest needs neither a crown nor abandonment. Listen.',
    },
    successDialogue: [
      { who: 'jack', text: 'I will guard its wonder by listening first.' },
    ],
    next: 'epilogue',
  },
  {
    id: 'epilogue', bg: 'forest', music: 'wonder', ending: true,
    cutscene: {
      fx: 'dawn', hold: 3.4,
      lines: [
        'The horn took back its light, and the light took back the year.',
        'Green came first. Then the rest, all at once, like an argument won.',
        'They named it the seventh colour.',
        'You only ever catch it at dawn, and only if you were still.',
      ],
    },
    next: null,
  },
];
