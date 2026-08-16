// Every beat is a data row on the one story machine (design rule 2). The
// spine (M2) chains 1 -> 6 -> 12 directly; the missing beats 2-5, 7-11 slot
// in at M3/M4 without touching story.js or main.js, only this file.
export const BEATS = [
  {
    id: 'shadow-council', bg: 'shadow-council',
    faces: [{ key: 'darkness', x: 160, y: 62, scale: 1 }],
    dialogue: [
      { who: 'darkness', text: 'Winter answers to no one but me.' },
      { who: 'darkness', text: 'Let them search. The light I took will not be found.' },
    ],
    next: 'gown-that-breathes',
  },
  {
    id: 'gown-that-breathes', bg: 'hall',
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
    next: 'seventh-color',
  },
  {
    id: 'seventh-color', bg: 'forest', ending: true,
    faces: [
      { key: 'jack', x: 108, y: 62, scale: .68 },
      { key: 'lili', x: 212, y: 62, scale: .68 },
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
