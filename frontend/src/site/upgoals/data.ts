// BMTning 17 ta Barqaror rivojlanish maqsadi (BRM). Matnlar asosi — BMTTD O‘zbekiston «Barqaror rivojlanish maqsadlari»
// risolasi (o‘zbek va rus nashrlari, 2018; public/upgoals/docs). Raqamlar risoladagi kabi (asosan 2013–2015 yillar ma’lumotlari).
// Ikonkalar — BMTning rasmiy BRM ikonkalari (o‘zbekcha lokalizatsiya), public/upgoals/icons. Ranglar — rasmiy BRM palitrasi.
import type { Lang } from "../../lib/api";

export type L3 = Record<Lang, string>;
export interface Goal {
  n: number;
  color: string;
  title: L3;
  short: L3;
  facts: { v: string; t: L3 }[];
  acts: L3[];
  note?: L3; // universitet yo‘nalishiga yaqin maqsadlar uchun standart matn (admin o‘zgartiradi)
}

export const GOALS: Goal[] = [
  {
    n: 1,
    color: "#E5243B",
    title: {
      uz: "Qashshoqlikka barham berish",
      ru: "Ликвидация нищеты",
      en: "No poverty",
    },
    short: {
      uz: "2030-yilgacha qashshoqlikning barcha shakllariga hamma joyda barham berish.",
      ru: "Повсеместная ликвидация нищеты во всех её формах к 2030 году.",
      en: "End poverty in all its forms everywhere by 2030.",
    },
    facts: [
      {
        v: "836 mln",
        t: {
          uz: "kishi o‘ta qashshoqlikda yashaydi",
          ru: "человек живут в крайней нищете",
          en: "people still live in extreme poverty",
        },
      },
      {
        v: "1 / 5",
        t: {
          uz: "rivojlanayotgan mamlakatlar aholisi kuniga 1,25 dollardan kam mablag‘ bilan yashaydi",
          ru: "жителей развивающихся стран живут менее чем на $1,25 в день",
          en: "people in developing regions live on less than $1.25 a day",
        },
      },
      {
        v: "1 / 4",
        t: {
          uz: "besh yoshgacha bolalarning bo‘yi me’yordan past",
          ru: "детей до пяти лет имеют недостаточный рост",
          en: "children under five are too short for their age",
        },
      },
    ],
    acts: [
      {
        uz: "Mahalladagi xayriya va ko‘ngillilar tashabbuslarida qatnashing.",
        ru: "Участвуйте в благотворительных и волонтёрских инициативах своей махалли.",
        en: "Join charity and volunteer initiatives in your community.",
      },
      {
        uz: "Moliyaviy savodxonlikni o‘rganing va boshqalarga o‘rgating.",
        ru: "Изучайте финансовую грамотность и делитесь знаниями с другими.",
        en: "Build financial literacy and share it with others.",
      },
      {
        uz: "Mahalliy ishlab chiqaruvchilar va kichik bizneslarni qo‘llab-quvvatlang.",
        ru: "Поддерживайте местных производителей и малый бизнес.",
        en: "Support local producers and small businesses.",
      },
    ],
  },
  {
    n: 2,
    color: "#DDA63A",
    title: {
      uz: "Ochlikka barham berish",
      ru: "Ликвидация голода",
      en: "Zero hunger",
    },
    short: {
      uz: "Ochlikni tugatish, oziq-ovqat xavfsizligini ta’minlash, oziqlanishni yaxshilash va qishloq xo‘jaligining barqaror rivojlanishiga ko‘maklashish.",
      ru: "Ликвидация голода, обеспечение продовольственной безопасности, улучшение питания и содействие устойчивому развитию сельского хозяйства.",
      en: "End hunger, achieve food security and improved nutrition and promote sustainable agriculture.",
    },
    facts: [
      {
        v: "795 mln",
        t: {
          uz: "kishi — har to‘qqiz kishidan biri — to‘yib ovqat yemaydi",
          ru: "человек — каждый девятый — недоедают",
          en: "people — one in nine — are undernourished",
        },
      },
      {
        v: "45%",
        t: {
          uz: "besh yoshgacha bolalar o‘limi to‘yib ovqat yemaslik bilan bog‘liq",
          ru: "смертей детей до пяти лет связаны с недоеданием",
          en: "of deaths of children under five are caused by poor nutrition",
        },
      },
      {
        v: "3,1 mln",
        t: {
          uz: "bola har yili shu sababli hayotdan ko‘z yumadi",
          ru: "детей ежегодно умирают от недоедания",
          en: "children die from undernutrition each year",
        },
      },
    ],
    acts: [
      {
        uz: "Mahalliy fermerlar va bozorlarni qo‘llab-quvvatlang, barqaror usulda yetishtirilgan mahsulotni tanlang.",
        ru: "Поддерживайте местных фермеров и рынки, выбирайте продукты, произведённые устойчивыми методами.",
        en: "Support local farmers and markets and choose sustainably produced food.",
      },
      {
        uz: "Ovqatni isrof qilmang: kerakli miqdorda xarid qiling va qoldiqdan unumli foydalaning.",
        ru: "Не выбрасывайте еду: покупайте столько, сколько нужно, и используйте остатки.",
        en: "Don’t waste food: buy what you need and use leftovers.",
      },
      {
        uz: "Oziq-ovqat xavfsizligi va sog‘lom ovqatlanish bo‘yicha bilimingizni oshiring.",
        ru: "Узнавайте больше о безопасности пищевых продуктов и здоровом питании.",
        en: "Learn more about food safety and healthy nutrition.",
      },
    ],
    note: {
      uz: "Ta’lim dasturlari, laboratoriyalar va amaliy tadqiqotlar orqali barqaror rivojlanish va jamiyat farovonligiga hissa qo‘shish.",
      ru: "Вклад в устойчивое развитие и благополучие общества через образовательные программы, лаборатории и практические исследования.",
      en: "Contributing to sustainable development and societal well-being through academic programmes, laboratories and applied research.",
    },
  },
  {
    n: 3,
    color: "#4C9F38",
    title: {
      uz: "Sog‘lik va farovonlik",
      ru: "Хорошее здоровье и благополучие",
      en: "Good health and well-being",
    },
    short: {
      uz: "Har qanday yoshdagi barcha insonlar uchun sog‘lom turmush tarzini ta’minlash va farovonlikka ko‘maklashish.",
      ru: "Обеспечение здорового образа жизни и содействие благополучию для всех в любом возрасте.",
      en: "Ensure healthy lives and promote well-being for all at all ages.",
    },
    facts: [
      {
        v: "6,3 mln",
        t: {
          uz: "besh yoshgacha bolalar o‘limi 12,7 milliondan shu darajagacha kamaydi",
          ru: "до такого уровня снизилась смертность детей до пяти лет (с 12,7 млн)",
          en: "deaths of children under five, down from 12.7 million",
        },
      },
      {
        v: "17 000",
        t: {
          uz: "bola 2013-yilda 1990-yilga nisbatan har kuni kamroq vafot etdi",
          ru: "детей в день умирало в 2013 году меньше, чем в 1990-м",
          en: "fewer children died each day in 2013 than in 1990",
        },
      },
      {
        v: "≈50%",
        t: {
          uz: "ga onalar o‘limi 1990-yildan beri qisqardi",
          ru: "снизилась материнская смертность с 1990 года",
          en: "drop in maternal mortality since 1990",
        },
      },
    ],
    acts: [
      {
        uz: "O‘zingiz va yaqinlaringiz sog‘lig‘iga e’tiborli bo‘ling, emlash jadvaliga amal qiling.",
        ru: "Заботьтесь о своём здоровье и здоровье близких, соблюдайте график вакцинации.",
        en: "Take care of your and your family’s health and keep vaccinations up to date.",
      },
      {
        uz: "Sog‘lom ovqatlaning va muntazam jismoniy faol bo‘ling.",
        ru: "Питайтесь правильно и регулярно занимайтесь физической активностью.",
        en: "Eat well and stay physically active.",
      },
      {
        uz: "Sog‘liqni saqlash mavzusidagi tadbirlarni tashkil eting yoki qatnashing.",
        ru: "Организуйте и посещайте мероприятия о здоровье в учебных заведениях и клубах.",
        en: "Organise or join health awareness events at school or in clubs.",
      },
    ],
  },
  {
    n: 4,
    color: "#C5192D",
    title: {
      uz: "Sifatli ta’lim",
      ru: "Качественное образование",
      en: "Quality education",
    },
    short: {
      uz: "Barcha uchun inklyuziv va sifatli ta’limni ta’minlash hamda umrbod o‘qish imkoniyatlarini rag‘batlantirish.",
      ru: "Обеспечение всеохватного и качественного образования для всех и поощрение обучения на протяжении всей жизни.",
      en: "Ensure inclusive and equitable quality education and promote lifelong learning opportunities for all.",
    },
    facts: [
      {
        v: "91%",
        t: {
          uz: "rivojlanayotgan mamlakatlardagi bolalar boshlang‘ich ta’lim bilan qamrab olingan",
          ru: "детей в развивающихся странах охвачены начальным образованием",
          en: "of children in developing regions are enrolled in primary school",
        },
      },
      {
        v: "57 mln",
        t: {
          uz: "maktab yoshidagi bola hanuz maktabga bormaydi",
          ru: "детей школьного возраста не посещают школу",
          en: "school-age children are still out of school",
        },
      },
      {
        v: "50%",
        t: {
          uz: "maktabga bormayotgan bolalar mojaro hududlarida yashaydi",
          ru: "не посещающих школу детей живут в зонах конфликтов",
          en: "of out-of-school children live in conflict-affected areas",
        },
      },
    ],
    acts: [
      {
        uz: "Bilimingizni tengdoshlaringiz bilan bo‘lishing — repetitorlik va mentorlik qiling.",
        ru: "Делитесь знаниями со сверстниками — станьте тьютором или наставником.",
        en: "Share what you know — tutor or mentor others.",
      },
      {
        uz: "Ochiq onlayn kurslar va elektron kutubxonadan muntazam foydalaning.",
        ru: "Регулярно пользуйтесь открытыми онлайн-курсами и электронной библиотекой.",
        en: "Use open online courses and the e-library regularly.",
      },
      {
        uz: "Imkoniyati cheklangan talabalar uchun qulay muhit yaratishga yordam bering.",
        ru: "Помогайте создавать доступную среду для студентов с инвалидностью.",
        en: "Help make learning accessible to students with disabilities.",
      },
    ],
    note: {
      uz: "Bakalavriat, magistratura va doktorantura dasturlari, elektron kutubxona va ochiq ta’lim resurslari — sifatli va hammaga ochiq ta’lim sari qadamlar.",
      ru: "Программы бакалавриата, магистратуры и докторантуры, электронная библиотека и открытые образовательные ресурсы — шаги к качественному и доступному образованию.",
      en: "Bachelor’s, master’s and doctoral programmes, the e-library and open educational resources are steps towards quality education open to all.",
    },
  },
  {
    n: 5,
    color: "#FF3A21",
    title: {
      uz: "Gender tengligi",
      ru: "Гендерное равенство",
      en: "Gender equality",
    },
    short: {
      uz: "Gender tengligini ta’minlash, barcha ayollar va qizlarning huquq va imkoniyatlarini kengaytirish.",
      ru: "Обеспечение гендерного равенства и расширение прав и возможностей всех женщин и девочек.",
      en: "Achieve gender equality and empower all women and girls.",
    },
    facts: [
      {
        v: "2 / 3",
        t: {
          uz: "rivojlanayotgan mamlakatlar boshlang‘ich ta’limda gender muvozanatiga erishgan",
          ru: "развивающихся стран достигли гендерного баланса в начальном образовании",
          en: "of developing countries have reached gender parity in primary education",
        },
      },
      {
        v: "143",
        t: {
          uz: "mamlakat konstitutsiyasida erkak va ayol tengligi kafolatlangan (2014)",
          ru: "страны гарантировали равенство мужчин и женщин в конституции (2014)",
          en: "countries guaranteed equality of men and women in their constitutions (2014)",
        },
      },
      {
        v: "15 mln",
        t: {
          uz: "qiz har yili 18 yoshga to‘lmay turmushga chiqariladi",
          ru: "девочек ежегодно выдают замуж до 18 лет",
          en: "girls are married before 18 every year",
        },
      },
    ],
    acts: [
      {
        uz: "Qizlarni ta’lim va ilm-fanga, ayniqsa muhandislik yo‘nalishlariga rag‘batlantiring.",
        ru: "Поддерживайте девушек в образовании и науке, особенно в инженерных специальностях.",
        en: "Encourage girls in education and science, especially in engineering.",
      },
      {
        uz: "Stereotiplar va kamsitishga qarshi turing.",
        ru: "Противостойте стереотипам и дискриминации.",
        en: "Challenge stereotypes and discrimination.",
      },
      {
        uz: "Hurmatga asoslangan munosabatlarni qo‘llab-quvvatlang.",
        ru: "Стройте отношения, основанные на уважении.",
        en: "Build relationships based on respect.",
      },
    ],
  },
  {
    n: 6,
    color: "#26BDE2",
    title: {
      uz: "Toza suv va sanitariya",
      ru: "Чистая вода и санитария",
      en: "Clean water and sanitation",
    },
    short: {
      uz: "Barcha uchun xavfsiz suv resurslari va sanitariyadan foydalanish imkoniyatini ta’minlash.",
      ru: "Обеспечение доступа к безопасным водным ресурсам и санитарии для всех.",
      en: "Ensure availability and sustainable management of water and sanitation for all.",
    },
    facts: [
      {
        v: "2,6 mlrd",
        t: {
          uz: "kishi 1990-yildan beri sifatli ichimlik suviga ega bo‘ldi",
          ru: "человек получили доступ к улучшенной питьевой воде с 1990 года",
          en: "people gained access to improved drinking water since 1990",
        },
      },
      {
        v: "663 mln",
        t: {
          uz: "kishi hanuz toza ichimlik suvidan mahrum",
          ru: "человек по-прежнему лишены доступа к чистой воде",
          en: "people still lack access to safe drinking water",
        },
      },
      {
        v: "2,4 mlrd",
        t: {
          uz: "kishi asosiy sanitariya xizmatlaridan foydalana olmaydi",
          ru: "человек не имеют доступа к базовой санитарии",
          en: "people lack basic sanitation",
        },
      },
    ],
    acts: [
      {
        uz: "Suvni tejang: jo‘mrakni ochiq qoldirmang, oqayotgan quvurlarni xabar qiling.",
        ru: "Экономьте воду: закрывайте кран и сообщайте о протечках.",
        en: "Save water: turn off taps and report leaks.",
      },
      {
        uz: "Ishlab chiqarishda suvni qayta ishlatish texnologiyalarini o‘rganing.",
        ru: "Изучайте технологии повторного использования воды в производстве.",
        en: "Learn about water reuse technologies in production.",
      },
      {
        uz: "Butunjahon suv kuni tadbirlarida qatnashing.",
        ru: "Участвуйте в мероприятиях Всемирного дня водных ресурсов.",
        en: "Take part in World Water Day activities.",
      },
    ],
  },
  {
    n: 7,
    color: "#FCC30B",
    title: {
      uz: "Arzon va toza energiya",
      ru: "Недорогостоящая и чистая энергия",
      en: "Affordable and clean energy",
    },
    short: {
      uz: "Barcha uchun arzon, ishonchli, barqaror va zamonaviy energiya manbalaridan foydalanishni ta’minlash.",
      ru: "Обеспечение всеобщего доступа к недорогим, надёжным, устойчивым и современным источникам энергии.",
      en: "Ensure access to affordable, reliable, sustainable and modern energy for all.",
    },
    facts: [
      {
        v: "1 / 5",
        t: {
          uz: "kishi elektr energiyasidan foydalana olmaydi",
          ru: "человек в мире не имеет доступа к электроэнергии",
          en: "people worldwide lack access to electricity",
        },
      },
      {
        v: "3 mlrd",
        t: {
          uz: "kishi ovqat pishirish va isitish uchun o‘tin va o‘simlik qoldiqlariga tayanadi",
          ru: "человек зависят от древесины и растительных остатков для готовки и отопления",
          en: "people rely on wood and crop waste for cooking and heating",
        },
      },
    ],
    acts: [
      {
        uz: "Keraksiz chiroq va qurilmalarni o‘chiring, energiya tejovchi lampalardan foydalaning.",
        ru: "Выключайте ненужный свет и приборы, используйте энергосберегающие лампы.",
        en: "Switch off unused lights and devices; use efficient bulbs.",
      },
      {
        uz: "Quyosh va boshqa qayta tiklanuvchi energiya loyihalarini o‘rganing.",
        ru: "Изучайте солнечную и другую возобновляемую энергетику.",
        en: "Learn about solar and other renewable energy.",
      },
      {
        uz: "Ishlab chiqarishda energiya samaradorligi bo‘yicha takliflar bering.",
        ru: "Предлагайте решения по энергоэффективности в производстве.",
        en: "Propose energy-efficiency improvements in production.",
      },
    ],
  },
  {
    n: 8,
    color: "#A21942",
    title: {
      uz: "Munosib mehnat va iqtisodiy o‘sish",
      ru: "Достойная работа и экономический рост",
      en: "Decent work and economic growth",
    },
    short: {
      uz: "Barqaror va inklyuziv iqtisodiy o‘sishga, to‘liq va samarali bandlikka hamda barcha uchun munosib mehnatga ko‘maklashish.",
      ru: "Содействие всеохватному и устойчивому экономическому росту, полной и производительной занятости и достойной работе для всех.",
      en: "Promote sustained, inclusive economic growth, full and productive employment and decent work for all.",
    },
    facts: [
      {
        v: "202 mln",
        t: {
          uz: "ishsiz (2012); ulardan 75 millioni — yoshlar",
          ru: "безработных в мире (2012), из них 75 млн — молодёжь",
          en: "unemployed people (2012), 75 million of them young",
        },
      },
      {
        v: "470 mln",
        t: {
          uz: "yangi ish o‘rni 2016–2030-yillarda kerak bo‘ladi",
          ru: "новых рабочих мест потребуется в 2016–2030 годах",
          en: "new jobs are needed between 2016 and 2030",
        },
      },
      {
        v: "2,2 mlrd",
        t: {
          uz: "kishi kuniga 2 dollardan kam daromad bilan yashaydi",
          ru: "человек живут менее чем на $2 в день",
          en: "people live on less than $2 a day",
        },
      },
    ],
    acts: [
      {
        uz: "Amaliyot va stajirovka orqali kasbiy ko‘nikmalaringizni oshiring.",
        ru: "Развивайте профессиональные навыки на практике и стажировках.",
        en: "Build professional skills through internships and practice.",
      },
      {
        uz: "Tadbirkorlik g‘oyalaringizni startap tanlovlarida sinab ko‘ring.",
        ru: "Проверяйте свои бизнес-идеи на стартап-конкурсах.",
        en: "Test your business ideas in startup competitions.",
      },
      {
        uz: "Mehnat huquqlaringizni biling va hurmat qiling.",
        ru: "Знайте и уважайте трудовые права.",
        en: "Know and respect labour rights.",
      },
    ],
    note: {
      uz: "Ishlab chiqarish va sanoat korxonalari bilan hamkorlikdagi amaliyotlar va karyera markazi bitiruvchilarning munosib ish topishiga xizmat qiladi.",
      ru: "Практика на предприятиях-партнёрах и центр карьеры помогают выпускникам находить достойную работу и поддерживают рост экономики.",
      en: "Industry internships, partner programmes and the career centre help graduates find decent work and support economic growth.",
    },
  },
  {
    n: 9,
    color: "#FD6925",
    title: {
      uz: "Sanoat, innovatsiya va infratuzilma",
      ru: "Индустриализация, инновации и инфраструктура",
      en: "Industry, innovation and infrastructure",
    },
    short: {
      uz: "Mustahkam infratuzilma yaratish, inklyuziv va barqaror sanoatlashtirish hamda innovatsiyalarga ko‘maklashish.",
      ru: "Создание стойкой инфраструктуры, содействие всеохватной и устойчивой индустриализации и инновациям.",
      en: "Build resilient infrastructure, promote inclusive and sustainable industrialization and foster innovation.",
    },
    facts: [
      {
        v: "2,6 mlrd",
        t: {
          uz: "kishi uzluksiz elektr ta’minotiga ega emas",
          ru: "человек испытывают трудности с бесперебойным электроснабжением",
          en: "people lack reliable electricity",
        },
      },
      {
        v: "2,5 mlrd",
        t: {
          uz: "kishi asosiy sanitariya xizmatlaridan mahrum",
          ru: "человек не имеют доступа к базовой санитарии",
          en: "people lack basic sanitation",
        },
      },
      {
        v: "800 mln",
        t: {
          uz: "ga yaqin kishi suvdan foydalana olmaydi",
          ru: "человек не имеют доступа к воде",
          en: "people lack access to water",
        },
      },
    ],
    acts: [
      {
        uz: "Ilmiy-tadqiqot va ixtirochilik loyihalarida qatnashing.",
        ru: "Участвуйте в научно-исследовательских и изобретательских проектах.",
        en: "Join research and invention projects.",
      },
      {
        uz: "Raqamli ko‘nikmalarni o‘rganing — ular har qanday sohada innovatsiya manbai.",
        ru: "Осваивайте цифровые навыки — источник инноваций в любой отрасли.",
        en: "Learn digital skills — the source of innovation in any field.",
      },
      {
        uz: "Sanoatning hayotimizga ta’siri haqida o‘ylang va barqaror yechimlarni targ‘ib qiling.",
        ru: "Задумывайтесь о влиянии промышленности на нашу жизнь и продвигайте устойчивые решения.",
        en: "Think about industry’s impact on our lives and promote sustainable solutions.",
      },
    ],
    note: {
      uz: "Zamonaviy laboratoriyalar va ilmiy-amaliy loyihalar — sanoatda yangi texnologiyalar va innovatsion yechimlar yaratish uchun asos.",
      ru: "Современные лаборатории и научно-практические проекты — основа для новых технологий и инновационных решений в промышленности.",
      en: "Modern laboratories and research projects underpin new technologies and innovative solutions across industry.",
    },
  },
  {
    n: 10,
    color: "#DD1367",
    title: {
      uz: "Tengsizlikni qisqartirish",
      ru: "Уменьшение неравенства",
      en: "Reduced inequalities",
    },
    short: {
      uz: "Mamlakatlar ichida va ular o‘rtasidagi tengsizlikni kamaytirish.",
      ru: "Сокращение неравенства внутри стран и между ними.",
      en: "Reduce inequality within and among countries.",
    },
    facts: [
      {
        v: "75%",
        t: {
          uz: "rivojlanayotgan mamlakatlar aholisi daromadi 1990-yillardagidan notekisroq taqsimlangan jamiyatda yashaydi",
          ru: "населения развивающихся стран живут в обществах, где доходы распределены менее равномерно, чем в 1990-е",
          en: "of people in developing countries live in societies where income is less evenly distributed than in the 1990s",
        },
      },
      {
        v: "3×",
        t: {
          uz: "kambag‘al oilalarda bolaning besh yoshgacha omon qolish ehtimoli shuncha kam",
          ru: "ниже вероятность дожить до пяти лет у детей из беднейших семей",
          en: "lower chance of reaching age five for children from the poorest households",
        },
      },
      {
        v: "5×",
        t: {
          uz: "nogironligi bor insonlarda tibbiy xarajatlar shuncha yuqori bo‘lish ehtimoli",
          ru: "выше вероятность чрезмерных расходов на лечение у людей с инвалидностью",
          en: "higher risk of catastrophic health spending for people with disabilities",
        },
      },
    ],
    acts: [
      {
        uz: "Har qanday kamsitishga qarshi chiqing.",
        ru: "Выступайте против любой дискриминации.",
        en: "Speak up against any discrimination.",
      },
      {
        uz: "Imkoniyati cheklangan insonlar uchun qulay muhit yaratishda ko‘maklashing.",
        ru: "Помогайте создавать доступную среду для людей с инвалидностью.",
        en: "Help create accessible environments for people with disabilities.",
      },
      {
        uz: "Ijtimoiy himoyaga muhtoj tengdoshlaringizga yordam qo‘lini cho‘zing.",
        ru: "Поддерживайте сверстников, нуждающихся в социальной защите.",
        en: "Support peers who need social protection.",
      },
    ],
  },
  {
    n: 11,
    color: "#FD9D24",
    title: {
      uz: "Barqaror shaharlar va aholi punktlari",
      ru: "Устойчивые города и населённые пункты",
      en: "Sustainable cities and communities",
    },
    short: {
      uz: "Shaharlar va aholi punktlarini ochiq, xavfsiz, mustahkam va ekologik barqaror qilish.",
      ru: "Сделать города и населённые пункты открытыми, безопасными, жизнестойкими и экологически устойчивыми.",
      en: "Make cities and human settlements inclusive, safe, resilient and sustainable.",
    },
    facts: [
      {
        v: "3,5 mlrd",
        t: {
          uz: "kishi — insoniyatning yarmi — shaharlarda yashaydi",
          ru: "человек — половина человечества — живут в городах",
          en: "people — half of humanity — live in cities",
        },
      },
      {
        v: "60%",
        t: {
          uz: "dunyo aholisi 2030-yilga borib shaharlarda yashaydi",
          ru: "населения мира будут жить в городах к 2030 году",
          en: "of the world’s population will live in cities by 2030",
        },
      },
      {
        v: "828 mln",
        t: {
          uz: "kishi xaroba mahallalarda yashaydi",
          ru: "человек живут в трущобах",
          en: "people live in slums",
        },
      },
    ],
    acts: [
      {
        uz: "Jamoat transporti, velosiped yoki piyoda yurishni tanlang.",
        ru: "Выбирайте общественный транспорт, велосипед или пешие прогулки.",
        en: "Choose public transport, cycling or walking.",
      },
      {
        uz: "Mahallangizni ko‘kalamzorlashtirish tadbirlarida qatnashing.",
        ru: "Участвуйте в озеленении своего района.",
        en: "Help green your neighbourhood.",
      },
      {
        uz: "Jamoat joylarini toza va xavfsiz saqlashga hissa qo‘shing.",
        ru: "Помогайте поддерживать общественные места чистыми и безопасными.",
        en: "Help keep public spaces clean and safe.",
      },
    ],
  },
  {
    n: 12,
    color: "#BF8B2E",
    title: {
      uz: "Mas’uliyatli iste’mol va ishlab chiqarish",
      ru: "Ответственное потребление и производство",
      en: "Responsible consumption and production",
    },
    short: {
      uz: "Oqilona iste’mol va ishlab chiqarish modellariga o‘tishni ta’minlash.",
      ru: "Обеспечение перехода к рациональным моделям потребления и производства.",
      en: "Ensure sustainable consumption and production patterns.",
    },
    facts: [
      {
        v: "3 mlrd t",
        t: {
          uz: "oziq-ovqat chiqindisi har yili paydo bo‘ladi — 1 milliard kishi och qolgan bir paytda",
          ru: "пищевых отходов образуется ежегодно, тогда как 1 млрд человек голодают",
          en: "of food is wasted each year while a billion people go hungry",
        },
      },
      {
        v: "< 3%",
        t: {
          uz: "dunyo suv zaxiralari chuchuk suvdan iborat",
          ru: "мировых водных ресурсов — пресная вода",
          en: "of the world’s water is fresh water",
        },
      },
      {
        v: "29%",
        t: {
          uz: "global energiya iste’moli uy xo‘jaliklariga to‘g‘ri keladi",
          ru: "мирового энергопотребления приходится на домохозяйства",
          en: "of global energy is consumed by households",
        },
      },
    ],
    acts: [
      {
        uz: "Ovqatni tashlamang, plastikni kamaytiring, ko‘p martalik xaltadan foydalaning.",
        ru: "Не выбрасывайте еду, сокращайте пластик, пользуйтесь многоразовыми сумками.",
        en: "Don’t waste food, cut plastic, use reusable bags.",
      },
      {
        uz: "Plastik idishlarni saralab qayta ishlashga topshiring.",
        ru: "Сортируйте и сдавайте пластик на переработку.",
        en: "Sort and recycle plastic packaging.",
      },
      {
        uz: "Xarid qilishdan oldin o‘ylang: ekologik barqaror mahsulotni tanlang.",
        ru: "Думайте перед покупкой и выбирайте экологичные товары.",
        en: "Think before you buy and choose sustainable products.",
      },
    ],
    note: {
      uz: "Resurs tejovchi va chiqindini kamaytirishga qaratilgan texnologiyalar hamda barqaror ishlab chiqarish — o‘quv dasturlari va ilmiy ishlarning muhim mavzulari.",
      ru: "Ресурсосберегающие технологии, снижение отходов и устойчивое производство — важные темы учебных программ и научной работы.",
      en: "Resource-saving technologies, waste reduction and sustainable production practices are key topics in teaching and research.",
    },
  },
  {
    n: 13,
    color: "#3F7E44",
    title: {
      uz: "Iqlim o‘zgarishiga qarshi kurash",
      ru: "Борьба с изменением климата",
      en: "Climate action",
    },
    short: {
      uz: "Iqlim o‘zgarishi va uning oqibatlariga qarshi kurashish bo‘yicha zudlik bilan choralar ko‘rish.",
      ru: "Принятие срочных мер по борьбе с изменением климата и его последствиями.",
      en: "Take urgent action to combat climate change and its impacts.",
    },
    facts: [
      {
        v: "19 sm",
        t: {
          uz: "ga dunyo okeani sathi 1901–2010-yillarda ko‘tarildi",
          ru: "поднялся уровень моря с 1901 по 2010 год",
          en: "global sea-level rise between 1901 and 2010",
        },
      },
      {
        v: "1,07 mln km²",
        t: {
          uz: "Arktika muzlari har o‘n yilda shuncha qisqarmoqda (1979-yildan)",
          ru: "теряет арктический морской лёд каждое десятилетие с 1979 года",
          en: "of Arctic sea ice lost every decade since 1979",
        },
      },
      {
        v: "1,5 °C",
        t: {
          uz: "harorat o‘sishi asr oxiriga borib bu chegaradan oshishi mumkin",
          ru: "— порог потепления, который может быть превышен к концу века",
          en: "warming threshold likely to be exceeded by the end of the century",
        },
      },
    ],
    acts: [
      {
        uz: "Keraksiz narsalarni chop etmang — elektron qaydlardan foydalaning.",
        ru: "Не печатайте лишнего — пользуйтесь цифровыми заметками.",
        en: "Don’t print — use digital notes.",
      },
      {
        uz: "Daraxt eking va ekilganlarini parvarish qiling.",
        ru: "Сажайте деревья и ухаживайте за ними.",
        en: "Plant trees and look after them.",
      },
      {
        uz: "Energiya va suvni tejang, chiqindini kamaytiring.",
        ru: "Экономьте энергию и воду, сокращайте отходы.",
        en: "Save energy and water; reduce waste.",
      },
    ],
    note: {
      uz: "«Yashil universitet» tashabbuslari: daraxt ekish, energiya va suvni tejash, chiqindini saralash, ekologik madaniyatni rivojlantirish.",
      ru: "Инициативы «Зелёного университета»: посадка деревьев, экономия энергии и воды, сортировка отходов, развитие экологической культуры.",
      en: "“Green campus” initiatives: tree planting, saving energy and water, waste sorting and environmental awareness.",
    },
  },
  {
    n: 14,
    color: "#0A97D9",
    title: {
      uz: "Suv osti hayoti",
      ru: "Сохранение морских экосистем",
      en: "Life below water",
    },
    short: {
      uz: "Okeanlar, dengizlar va dengiz resurslarini asrash va oqilona foydalanish.",
      ru: "Сохранение и рациональное использование океанов, морей и морских ресурсов.",
      en: "Conserve and sustainably use the oceans, seas and marine resources.",
    },
    facts: [
      {
        v: "3 / 4",
        t: {
          uz: "Yer yuzasini okeanlar egallaydi va ular sayyora suvining 97 foizini saqlaydi",
          ru: "поверхности Земли занимают океаны, в них 97% воды планеты",
          en: "of the Earth’s surface is ocean, holding 97% of its water",
        },
      },
      {
        v: "3 mlrd",
        t: {
          uz: "dan ortiq kishining hayoti dengiz va qirg‘oq bioxilma-xilligiga bog‘liq",
          ru: "человек зависят от морского и прибрежного биоразнообразия",
          en: "people depend on marine and coastal biodiversity",
        },
      },
      {
        v: "200 000",
        t: {
          uz: "ga yaqin tur okeanlarda aniqlangan — haqiqiy son millionlarda bo‘lishi mumkin",
          ru: "видов выявлено в океанах; реальное число может исчисляться миллионами",
          en: "identified species live in the oceans — the real number may be millions",
        },
      },
    ],
    acts: [
      {
        uz: "Bir martalik plastikdan voz keching — u okeanning asosiy ifloslantiruvchisi.",
        ru: "Откажитесь от одноразового пластика — главного загрязнителя океана.",
        en: "Avoid single-use plastic — a major ocean pollutant.",
      },
      {
        uz: "Sertifikatlangan va barqaror ovlangan baliq mahsulotlarini tanlang.",
        ru: "Выбирайте сертифицированные морепродукты устойчивого промысла.",
        en: "Choose certified, sustainably caught seafood.",
      },
      {
        uz: "Orol fojiasi saboqlarini o‘rganing va suv havzalarini asrang.",
        ru: "Изучайте уроки Аральской катастрофы и берегите водоёмы.",
        en: "Learn from the Aral Sea disaster and protect water bodies.",
      },
    ],
  },
  {
    n: 15,
    color: "#56C02B",
    title: {
      uz: "Quruqlikdagi hayot",
      ru: "Сохранение экосистем суши",
      en: "Life on land",
    },
    short: {
      uz: "O‘rmonlardan oqilona foydalanish, cho‘llanishga qarshi kurashish, yerlar degradatsiyasini to‘xtatish va bioxilma-xillikni saqlash.",
      ru: "Рациональное лесопользование, борьба с опустыниванием, прекращение деградации земель и утраты биоразнообразия.",
      en: "Sustainably manage forests, combat desertification, halt land degradation and biodiversity loss.",
    },
    facts: [
      {
        v: "1,6 mlrd",
        t: {
          uz: "kishi tirikchiligi o‘rmonlarga bog‘liq",
          ru: "человек добывают средства к существованию за счёт леса",
          en: "people depend on forests for their livelihoods",
        },
      },
      {
        v: "80%",
        t: {
          uz: "dan ortiq quruqlikdagi hayvon, o‘simlik va hasharot turlari o‘rmonlarda yashaydi",
          ru: "наземных видов животных, растений и насекомых обитают в лесах",
          en: "of land animals, plants and insects live in forests",
        },
      },
    ],
    acts: [
      {
        uz: "Yovvoyi tabiatni hurmat qiling, ekoturizmda mas’uliyatli bo‘ling.",
        ru: "Уважайте дикую природу и выбирайте ответственный экотуризм.",
        en: "Respect wildlife and travel responsibly.",
      },
      {
        uz: "Tuproqni asraydigan dehqonchilik usullarini qo‘llab-quvvatlang.",
        ru: "Поддерживайте методы земледелия, сохраняющие почву.",
        en: "Support farming practices that protect soil.",
      },
      {
        uz: "Qog‘ozni tejang va qayta ishlashga topshiring.",
        ru: "Экономьте бумагу и сдавайте её на переработку.",
        en: "Save and recycle paper.",
      },
    ],
  },
  {
    n: 16,
    color: "#00689D",
    title: {
      uz: "Tinchlik, adolat va samarali institutlar",
      ru: "Мир, правосудие и эффективные институты",
      en: "Peace, justice and strong institutions",
    },
    short: {
      uz: "Tinch va ochiq jamiyat qurish, hamma uchun odil sudlovdan foydalanishni ta’minlash, barcha darajalarda samarali va hisobdor institutlar yaratish.",
      ru: "Построение миролюбивого и открытого общества, обеспечение доступа к правосудию для всех и создание эффективных и подотчётных институтов на всех уровнях.",
      en: "Promote peaceful and inclusive societies, provide access to justice for all and build effective, accountable institutions at all levels.",
    },
    facts: [
      {
        v: "28,5 mln",
        t: {
          uz: "bola mojaro hududlarida boshlang‘ich maktabni tashlab ketgan (2011)",
          ru: "детей были вынуждены покинуть начальную школу в странах, затронутых конфликтами (2011)",
          en: "children left primary school in conflict-affected countries (2011)",
        },
      },
      {
        v: "50%",
        t: {
          uz: "boshlang‘ich maktabni tark etgan bolalar ulushi mojaro hududlarida",
          ru: "доля таких детей в странах, затронутых конфликтом",
          en: "share of out-of-school children living in conflict-affected countries",
        },
      },
    ],
    acts: [
      {
        uz: "Korrupsiyaga qarshi turing va halollikni qo‘llab-quvvatlang.",
        ru: "Противостойте коррупции и поддерживайте честность.",
        en: "Stand against corruption and uphold integrity.",
      },
      {
        uz: "Turli millat va dindagi insonlarni hurmat qiling.",
        ru: "Уважайте людей разного происхождения и вероисповедания.",
        en: "Respect people of all backgrounds and beliefs.",
      },
      {
        uz: "Jamoat hayotida faol bo‘ling — talabalar kengashida qatnashing.",
        ru: "Будьте активны в общественной жизни — участвуйте в студенческом совете.",
        en: "Be active in public life — join the student council.",
      },
    ],
  },
  {
    n: 17,
    color: "#19486A",
    title: {
      uz: "Maqsadlar yo‘lida hamkorlik",
      ru: "Партнёрство в интересах устойчивого развития",
      en: "Partnerships for the goals",
    },
    short: {
      uz: "Barqaror rivojlanish uchun global hamkorlik mexanizmlarini kuchaytirish.",
      ru: "Активизация глобального партнёрства в интересах устойчивого развития.",
      en: "Strengthen the means of implementation and revitalize the global partnership for sustainable development.",
    },
    facts: [
      {
        v: "79%",
        t: {
          uz: "rivojlanayotgan mamlakatlardan import rivojlangan mamlakatlarga bojsiz kiradi",
          ru: "импорта из развивающихся стран ввозится в развитые страны беспошлинно",
          en: "of imports from developing countries enter developed countries duty-free",
        },
      },
      {
        v: "30%",
        t: {
          uz: "dunyo yoshlari kamida besh yildan beri faol internet foydalanuvchisi",
          ru: "молодёжи мира — активные пользователи интернета не менее пяти лет",
          en: "of the world’s youth have been active internet users for at least five years",
        },
      },
      {
        v: "4 mlrd",
        t: {
          uz: "dan ortiq kishi internetdan foydalanmaydi, ularning 90 foizi rivojlanayotgan mamlakatlarda",
          ru: "человек не пользуются интернетом, 90% из них — в развивающихся странах",
          en: "people do not use the internet, 90% of them in developing countries",
        },
      },
    ],
    acts: [
      {
        uz: "Xalqaro almashinuv va qo‘shma dasturlarda qatnashing.",
        ru: "Участвуйте в международных обменах и совместных программах.",
        en: "Join international exchanges and joint programmes.",
      },
      {
        uz: "Universitetlar, biznes va jamiyat o‘rtasida loyihalar boshlang.",
        ru: "Запускайте проекты на стыке университета, бизнеса и общества.",
        en: "Start projects linking universities, business and society.",
      },
      {
        uz: "BRM haqida bilganlaringizni ijtimoiy tarmoqlarda ulashing.",
        ru: "Рассказывайте о ЦУР в социальных сетях.",
        en: "Share what you know about the SDGs online.",
      },
    ],
    note: {
      uz: "Xalqaro hamkorlik: qo‘shma ta’lim dasturlari, akademik almashinuvlar, xorijiy universitetlar va sanoat korxonalari bilan qo‘shma loyihalar.",
      ru: "Международное сотрудничество: совместные образовательные программы, академический обмен, совместные проекты с зарубежными вузами и предприятиями.",
      en: "International cooperation: joint academic programmes, exchanges, and collaborative projects with partner universities and industry.",
    },
  },
];

export const PRIORITY_DEFAULT = [2, 4, 8, 9, 12, 13, 17];

// Raqam birliklari: ma'lumotlarda o'zbekcha («mln», «mlrd», «sm», «t») — boshqa tillarda almashtiriladi.
const UNITS: Record<Lang, [RegExp, string][]> = {
  uz: [],
  ru: [
    [/\bmlrd\b/g, "млрд"],
    [/\bmln\b/g, "млн"],
    [/\bsm\b/g, "см"],
    [/ t$/g, " т"],
    [/km²/g, "км²"],
  ],
  en: [
    [/\bmlrd\b/g, "billion"],
    [/\bmln\b/g, "million"],
    [/\bsm\b/g, "cm"],
  ],
};
export function unit(v: string, lang: Lang): string {
  let s = v;
  for (const [re, to] of UNITS[lang]) s = s.replace(re, to);
  return lang === "en" ? s.replace(/(\d),(\d)/g, "$1.$2") : s;
}

// Ikonka: o‘zbekcha — to‘liq lokalizatsiya (SVG); rus tilida faqat 1, 2, 16 bor — qolganlari inglizcha.
export function iconSrc(n: number, lang: Lang): string {
  const nn = String(n).padStart(2, "0");
  if (lang === "uz") return `/upgoals/icons/uz/${nn}.svg`;
  if (lang === "ru" && [1, 2, 16].includes(n))
    return `/upgoals/icons/ru/${nn}.svg`;
  return `/upgoals/icons/en/${nn}.webp`;
}
// Piktogramma (matnsiz) — o‘zbekcha SVG’ning pastki qismi; plitkalarda nom o‘zimizning shriftda yoziladi.
export const pictoSrc = (n: number) =>
  `/upgoals/icons/uz/${String(n).padStart(2, "0")}.svg`;

export const T: Record<Lang, Record<string, string>> = {
  uz: {
    eyebrow: "Barqaror rivojlanish maqsadlari",
    title: "17 maqsad — bitta kelajak",
    lead: "2015-yilda BMTga a’zo barcha davlatlar 2030-yilgacha qashshoqlikka barham berish, sayyorani asrash va hamma uchun farovonlikni ta’minlash bo‘yicha 17 ta maqsadni qabul qildi. Universitet ta’lim, ilm-fan va amaliy loyihalar orqali bu maqsadlarga hissa qo‘shadi.",
    countdown: "2030-yilgacha qolgan kunlar",
    all: "Barcha maqsadlar",
    priority: "Ustuvor maqsadlar",
    priority_lead:
      "Sifatli ta’lim, innovatsiya, munosib mehnat va mas’uliyatli ishlab chiqarish — universitet faoliyati bilan eng chambarchas bog‘liq maqsadlar.",
    goal: "Maqsad",
    essence: "Maqsad mohiyati",
    why: "Nima uchun bu muhim?",
    why_src: "BMTTD O‘zbekiston risolasi ma’lumotlari",
    what: "Men nima qila olaman?",
    ours: "Universitet hissasi",
    activities: "Faoliyat va tadbirlar",
    docs: "Hujjatlar va hisobotlar",
    booklet: "BRM risolasi (BMTTD O‘zbekiston)",
    download: "Yuklab olish",
    prev: "Oldingi maqsad",
    next: "Keyingi maqsad",
    back: "Barcha maqsadlar",
    more: "Batafsil",
    icons_note:
      "BRM ikonkalari — Birlashgan Millatlar Tashkiloti. Ma’lumot uchun foydalanilgan.",
    empty: "Bu maqsad bo‘yicha faoliyat tez orada qo‘shiladi.",
    take: "Harakatni o‘zingizdan boshlang",
    take_lead:
      "Har bir maqsad sahifasida kundalik hayotda qila oladigan oddiy qadamlar bor.",
  },
  ru: {
    eyebrow: "Цели устойчивого развития",
    title: "17 целей — одно будущее",
    lead: "В 2015 году все государства — члены ООН приняли 17 целей, чтобы к 2030 году покончить с нищетой, сохранить планету и обеспечить благополучие для всех. Университет вносит вклад в их достижение через образование, науку и практические проекты.",
    countdown: "дней осталось до 2030 года",
    all: "Все цели",
    priority: "Приоритетные цели",
    priority_lead:
      "Качественное образование, инновации, достойная работа и ответственное производство — цели, теснее всего связанные с работой университета.",
    goal: "Цель",
    essence: "В чём состоит цель",
    why: "Почему это важно?",
    why_src: "По данным брошюры ПРООН Узбекистан",
    what: "Что я могу сделать?",
    ours: "Вклад университета",
    activities: "Деятельность и мероприятия",
    docs: "Документы и отчёты",
    booklet: "Брошюра о ЦУР (ПРООН Узбекистан)",
    download: "Скачать",
    prev: "Предыдущая цель",
    next: "Следующая цель",
    back: "Все цели",
    more: "Подробнее",
    icons_note:
      "Иконки ЦУР — Организация Объединённых Наций. Использованы в информационных целях.",
    empty: "Материалы по этой цели скоро появятся.",
    take: "Начните с себя",
    take_lead:
      "На странице каждой цели — простые шаги, которые можно сделать в повседневной жизни.",
  },
  en: {
    eyebrow: "Sustainable Development Goals",
    title: "17 goals, one future",
    lead: "In 2015 all UN member states adopted 17 goals to end poverty, protect the planet and ensure prosperity for all by 2030. The university contributes through education, research and practical projects.",
    countdown: "days left until 2030",
    all: "All goals",
    priority: "Priority goals",
    priority_lead:
      "Quality education, innovation, decent work and responsible production are the goals most closely tied to the university’s work.",
    goal: "Goal",
    essence: "What is the goal?",
    why: "Why does it matter?",
    why_src: "Figures from the UNDP Uzbekistan booklet",
    what: "What can I do?",
    ours: "University contribution",
    activities: "Activities and events",
    docs: "Documents and reports",
    booklet: "SDG booklet (UNDP Uzbekistan)",
    download: "Download",
    prev: "Previous goal",
    next: "Next goal",
    back: "All goals",
    more: "Learn more",
    icons_note: "SDG icons — United Nations. Used for information purposes.",
    empty: "Activities for this goal will be added soon.",
    take: "Start with yourself",
    take_lead:
      "Each goal page lists simple steps you can take in everyday life.",
  },
};
