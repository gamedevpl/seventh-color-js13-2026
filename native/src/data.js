// Every beat is a data row on the one story machine (design rule 2). Full
// chain, all twelve: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10 -> 11
// -> 12. `drone` sets the ambient base frequency per beat (audio.js) - low
// and tense through the castle, warmer once the color returns.
export const BEATS = [
  {
    id: 'shadow-council', bg: 'shadow-council', drone: 82,
    faces: [{ key: 'darkness', x: 160, y: 62, scale: 1 }],
    dialogue: [
      { who: 'darkness', text: 'Winter answers to no one but me.' },
      { who: 'darkness', text: 'Let them search. The light I took will not be found.' },
    ],
    next: 'winter-falls',
  },
  {
    id: 'winter-falls', bg: 'pond', drone: 110,
    faces: [{ key: 'jack', x: 160, y: 68, scale: .8 }],
    dialogue: [
      { who: 'jack', text: "Lili? The ice wasn't broken when we crossed." },
      { who: 'jack', text: 'Something pulled her under the frost.' },
    ],
    game: 'icerain', g: {},
    gamePrompt: 'Strike the ice before her trail is lost!',
    successDialogue: [
      { who: 'jack', text: 'The ice breaks - but her footprints end here.' },
    ],
    next: 'bog-road',
  },
  {
    id: 'bog-road', bg: 'bog', drone: 98,
    faces: [{ key: 'gump', x: 90, y: 78, scale: .62 }, { key: 'jack', x: 210, y: 70, scale: .72 }],
    dialogue: [
      { who: 'gump', text: 'Three warning lights guard the causeway.' },
      { who: 'gump', text: 'Silence them out of order and the bog wakes.' },
    ],
    game: 'lights', g: { order: [1, 2, 0] },
    gamePrompt: 'Silence the lights: they do not want the obvious order.',
    successDialogue: [
      { who: 'gump', text: 'The bog sleeps. Onward, before it stirs again.' },
    ],
    next: 'megs-looking-glass',
  },
  {
    id: 'megs-looking-glass', bg: 'cottage', drone: 104,
    faces: [{ key: 'meg', x: 224, y: 58, scale: .82 }, { key: 'jack', x: 96, y: 78, scale: .68 }],
    dialogue: [
      { who: 'meg', text: 'What soft little champion wanders into my supper?' },
      { who: 'jack', text: 'One too humble for a lady as magnificent as you.' },
      { who: 'meg', text: 'Magnificent? Say that again, morsel.' },
    ],
    game: 'dial', g: { target: .35, tolerance: .12, x: 160, y: 108, start: -1.3 },
    gamePrompt: 'Turn the mirror; catch the moonlight on Meg.',
    successDialogue: [
      { who: 'jack', text: 'My knees shook. My hand did not.' },
    ],
    next: 'root-door',
  },
  {
    id: 'root-door', bg: 'roots', drone: 90,
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
    id: 'gown-that-breathes', bg: 'hall', drone: 86,
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
    id: 'hidden-hand', bg: 'throne', drone: 78,
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
    id: 'false-sacrifice', bg: 'throne', drone: 74,
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
    id: 'final-beam', bg: 'throne', drone: 70,
    faces: [
      { key: 'darkness', x: 226, y: 56, scale: .74 },
      { key: 'jack', x: 96, y: 78, scale: .66 },
    ],
    dialogue: [
      { who: 'jack', text: 'Meg taught me something about mirrors and vanity.' },
      { who: 'darkness', text: 'A parlor trick will not unmake me, child.' },
    ],
    game: 'dial', g: { target: -.2, tolerance: .1, x: 160, y: 108, start: 1.4 },
    gamePrompt: 'Turn the light; let him see only himself.',
    successDialogue: [
      { who: 'jack', text: 'You were never the night. You were only its shadow.' },
    ],
    next: 'edge-of-world',
  },
  {
    id: 'edge-of-world', bg: 'causeway', drone: 60,
    faces: [{ key: 'jack', x: 160, y: 70, scale: .75 }],
    dialogue: [
      { who: 'jack', text: 'The floor is giving way behind us!' },
      { who: 'jack', text: "Don't stop - jump where the light still holds." },
    ],
    game: 'chase', g: { gaps: [.3, .55, .8], window: .1 },
    gamePrompt: 'Run - and leap the gaps as they open.',
    successDialogue: [
      { who: 'jack', text: 'Clear. The castle groans shut behind us.' },
    ],
    next: 'spring-remembers',
  },
  {
    id: 'spring-remembers', bg: 'stream', drone: 130,
    faces: [{ key: 'gump', x: 78, y: 82, scale: .58 }, { key: 'jack', x: 158, y: 76, scale: .68 }, { key: 'unicorn', x: 240, y: 92, scale: .5 }],
    dialogue: [
      { who: 'gump', text: 'The stallion still waits beneath the winter spell.' },
      { who: 'jack', text: 'Then the stolen light must remember where it belongs.' },
    ],
    game: 'dial', g: { target: -.9, tolerance: .1, x: 240, y: 92, start: 1.2 },
    gamePrompt: "Turn the alicorn; align its living grain.",
    successDialogue: [
      { who: 'gump', text: 'The stallion rises. Spring has found the forest again.' },
    ],
    next: 'seventh-color',
  },
  {
    id: 'seventh-color', bg: 'forest', drone: 220, ending: true,
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
    next: null,
  },
];
