// Telegram post muharriri uchun ixcham emoji to'plami (tashqi kutubxonasiz): eng ko'p ishlatiladiganlar, toifalar bo'yicha.
const split = (s: string): string[] => Array.from(new Intl.Segmenter("en", { granularity: "grapheme" }).segment(s.replace(/\s+/g, "")), (x) => x.segment);

export interface EmojiGroup {
  id: string;
  label: string;
  icon: string;
  list: string[];
}

export const EMOJI: EmojiGroup[] = [
  {
    id: "smileys",
    label: "Yuzlar",
    icon: "😀",
    list: split("😀😃😄😁😆😅🤣😂🙂🙃😉😊😇🥰😍🤩😘😗😚😋😛😜🤪😝🤑🤗🤭🫢🤫🤔🫡🤐🤨😐😑😶🫥😏😒🙄😬😮‍💨🤥😌😔😪🤤😴😷🤒🤕🤢🤮🥵🥶🥴😵🤯🤠🥳🥸😎🤓🧐😕🫤😟🙁😮😯😲😳🥺🥹😦😧😨😰😥😢😭😱😖😣😞😓😩😫🥱😤😡😠🤬"),
  },
  {
    id: "people",
    label: "Qo‘llar va odamlar",
    icon: "👍",
    list: split("👍👎👌🤌🤏✌️🤞🫰🤟🤘🤙👈👉👆👇☝️✋🤚🖐️🖖👋🤝🙏👏🙌👐🫶🤲💪✍️🫵👀🧠👨‍🎓👩‍🎓🧑‍🎓👨‍🏫👩‍🏫🧑‍🏫👨‍🔬👩‍🔬👨‍🍳👩‍🍳👨‍💻👩‍💻👨‍💼👩‍💼👨‍🌾👩‍🌾👷🧑‍⚕️👥🧑‍🤝‍🧑👨‍👩‍👧‍👦🙋🙋‍♂️🙆💁🤷"),
  },
  {
    id: "symbols",
    label: "Belgilar",
    icon: "❤️",
    list: split("❤️🧡💛💚🩵💙💜🤎🖤🤍❤️‍🔥💯✅☑️✔️❌❎❗❓‼️⁉️⚠️🚫⛔🔥⭐🌟✨⚡💥💫🎯📌📍🔔🔕📣📢💬💭🗯️🆕🆓🆗🆙🔝🔜➡️⬅️⬆️⬇️↗️↘️🔄🔗♻️🔴🟠🟡🟢🔵🟣🟤⚫⚪🟥🟧🟨🟩🟦🟪🔸🔹🔶🔷▶️⏩⏪⏸️⏹️🔢#️⃣1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣8️⃣9️⃣🔟©️®️™️"),
  },
  {
    id: "study",
    label: "Ta’lim va ish",
    icon: "🎓",
    list: split("🎓📚📖📝✏️🖊️🖋️📒📓📔📕📗📘📙🏫🏛️🔬🔭🧪🧫🧬⚗️🧮💡🖥️💻⌨️🖨️📊📈📉🗂️📁📂📎🖇️📏📐✂️📅📆🗓️⏰⏱️⏳⌛🏆🥇🥈🥉🎖️🏅📜📄📃📑🧾💼💰💵💳🏦📦✉️📧📨📩📮☎️📞📱🔒🔓🔑🛠️⚙️🧰"),
  },
  {
    id: "nature",
    label: "Tabiat va taomlar",
    icon: "🌿",
    list: split("🌱🌿☘️🍀🌾🌵🌲🌳🌴🌻🌼🌸🌺🌷🌹💐🍁🍂🍃🍎🍏🍐🍊🍋🍌🍉🍇🍓🫐🍒🍑🥭🍍🥥🥝🍅🍆🥑🥦🥬🥒🌶️🌽🥕🧄🧅🥔🍠🥐🍞🥖🫓🧀🥚🍳🥞🧇🥩🍗🍖🍔🍕🌯🥗🍲🍜🍝🍚🍛🍯🥛☕🍵🧃🥤🧋🍰🎂🧁🍪🍫🍬🍭🏭🚜🐄🐑🐝☀️🌤️⛅🌧️⛈️❄️🌈🌙🌍🌏💧🌊"),
  },
  {
    id: "events",
    label: "Tadbirlar",
    icon: "🎉",
    list: split("🎉🎊🎈🎁🎀🎂🎄🎆🎇🧨🪔🕌🌙🎤🎧🎬🎨🖌️🎭🎵🎶🎹🎸🥁🎻⚽🏀🏐🏈🎾🏓🏸🥊🏋️🤸🏃🚴🏊🧘♟️🎲🎮🚀✈️🚆🚌🚗🚕🚲🏠🏡🏢🏗️🏟️🗺️📸📷🎥📹📺📻🎙️🗣️🎫🎟️🏁🚩"),
  },
  {
    id: "flags",
    label: "Bayroqlar",
    icon: "🇺🇿",
    list: split("🇺🇿🇷🇺🇬🇧🇺🇸🇰🇿🇰🇬🇹🇯🇹🇲🇦🇿🇹🇷🇨🇳🇰🇷🇯🇵🇮🇳🇵🇰🇦🇪🇸🇦🇶🇦🇪🇬🇩🇪🇫🇷🇮🇹🇪🇸🇵🇱🇨🇿🇳🇱🇧🇪🇨🇭🇦🇹🇫🇮🇸🇪🇳🇴🇨🇦🇧🇷🇦🇺🇪🇺🇺🇳🏳️🏴🏁🚩"),
  },
];

const RECENT_KEY = "tg_emoji_recent";

export function recentEmoji(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 24) : [];
  } catch {
    return [];
  }
}

export function pushRecentEmoji(e: string) {
  try {
    const list = [e, ...recentEmoji().filter((x) => x !== e)].slice(0, 24);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* brauzer xotirasi yopiq — oxirgilar saqlanmaydi */
  }
}
