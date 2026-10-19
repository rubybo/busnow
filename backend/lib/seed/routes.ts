import {
  bareRoute,
  fromTable,
  multiStopDirection,
  oneDirection,
  twoDirections,
  type RouteSeed,
  trips,
  tripRow,
} from "./builders.ts";
import { applyPdfOverrides } from "./from-pdf.ts";
import * as T from "./tables.ts";

const ATP = "https://atp6voat.by/gorodskie-avtobusy/";
const ROUTE4 = "https://atp6voat.by/marshrut-%E2%84%964/";
const TAXI = "http://www.vitoperator.by/raspisanie/raspisanie-marshrutnyh-taksi-novopolock";

const BUS4_WD_FWD = [
  "08:44", "09:15", "09:37", "09:44", "10:08", "11:12", "11:26", "12:20",
  "13:00", "13:25", "13:58", "14:05", "14:40", "14:54", "15:05", "15:25",
  "17:55", "18:07", "18:23",
];
const BUS4_WD_BACK = [
  "09:09", "09:40", "10:02", "10:09", "10:33", "11:37", "11:51", "12:45",
  "13:25", "13:50", "14:23", "14:30", "15:05", "15:09", "15:30", "15:50",
  "18:20", "18:32", "18:48",
];
const BUS4_WE_FWD = ["08:32", "09:35", "12:30", "14:40", "16:25", "16:55", "17:40", "18:10"];
const BUS4_WE_BACK = ["08:57", "10:00", "12:55", "15:05", "16:50", "17:20", "18:05", "18:35"];

const BUS11_ROWS = [
  ["8-25", "8-45", "8-50", "8-56"],
  ["9-30", "9-50", "9-55", "10-01"],
  ["10-56", "11-16", "11-21", "11-27"],
  ["11-44", "12-04", "12-09", "12-15"],
  ["12-34", "12-54", "12-59", "13-05"],
  ["13-19", "13-39", "13-44", "13-50"],
  ["14-20", "14-40", "14-45", "14-51"],
  ["15-08", "15-28", "15-33", "15-39"],
  ["16-40", "17-00", "17-05", "17-11"],
] as const;

const BASE_ROUTES: RouteSeed[] = [
  bareRoute(
    "1",
    "1",
    "bus",
    "Больничный городок — ОАО «Нафтан»",
    "По рабочим дням, PDF АТП №6.",
    "https://atp6voat.by/marshrut-%E2%84%961/",
  ),
  bareRoute(
    "2",
    "2",
    "bus",
    "Подкастельцы — ОАО «Нафтан»",
    "По рабочим дням, PDF АТП №6.",
    ATP,
  ),
  bareRoute(
    "3",
    "3",
    "bus",
    "Больничный городок — 3-я проходная",
    "По рабочим дням, с 01.12.2025 до ст. Новополоцк.",
    ATP,
  ),
  twoDirections(
    {
      code: "4",
      slug: "4",
      kind: "bus",
      title: "Подкастельцы — Гайдара",
      sourceUrl: ROUTE4,
      note: "Время отправления с конечных, таблица АТП №6 с 01.09.2026.",
    },
    {
      label: "Подкастельцы → Гайдара",
      stop: "podkasteltsy",
      weekdays: BUS4_WD_FWD,
      weekend: BUS4_WE_FWD,
    },
    {
      label: "Гайдара → Подкастельцы",
      stop: "gaydara",
      weekdays: BUS4_WD_BACK,
      weekend: BUS4_WE_BACK,
    },
  ),
  {
    code: "4А",
    slug: "4a",
    kind: "bus",
    title: "9-й микрорайон — ул. Калинина",
    sourceUrl: ROUTE4,
    note: "По рабочим дням, с 01.09.2026. Отправления с промежуточных остановок.",
    directions: [
      {
        name: "9-й микрорайон → ул. Калинина",
        trips: {
          weekdays: [
            tripRow([
              { stop: "micro9", departs: "07:15" },
              { stop: "denisova", departs: "07:25" },
              { stop: "kalinina", departs: "07:40" },
            ]),
            tripRow([
              { stop: "micro9", departs: "07:48" },
              { stop: "denisova", departs: "07:58" },
              { stop: "kalinina", departs: "08:12" },
            ]),
            tripRow([
              { stop: "micro9", departs: "08:21" },
              { stop: "denisova", departs: "08:31" },
              { stop: "kalinina", departs: "08:45" },
            ]),
          ],
        },
      },
    ],
  },
  fromTable(
    {
      code: "5",
      slug: "5",
      kind: "bus",
      title: "Новополоцк — Полоцк (через Экимань)",
      sourceUrl: "http://atp6voat.by/marshrut-5/",
      note: "Стоимость проезда 1,15 рубля. Таблица с 03.11.2025 (будни) и 01.11.2025 (выходные).",
    },
    { label: "Автовокзал (Новополоцк) → Швейная фабрика", stop: "avtovokzal", column: [0, 2] },
    { label: "Швейная фабрика → Автовокзал (Новополоцк)", stop: "shveynaya", column: [1, 3] },
    T.BUS5_WD,
    T.BUS5_WE,
  ),
  fromTable(
    {
      code: "6",
      slug: "6",
      kind: "bus",
      title: "Автовокзал — Боровуха / УОР",
      sourceUrl: "http://atp6voat.by/marshrut-6/",
      note: "С 01.05.2026. Отправления с автовокзала и с конечных Боровуха/УОР.",
    },
    { label: "Автовокзал → Боровуха / УОР", stop: "avtovokzal", column: 0 },
    { label: "Боровуха / УОР → Автовокзал", stop: "terminal_bor_uor", column: 2 },
    T.BUS6_WD,
    T.BUS6_WD,
  ),
  bareRoute(
    "6А",
    "6a",
    "bus",
    "Подкастельцы — УОР",
    "По рабочим и выходным дням, с 04.11.2022.",
    "http://atp6voat.by/marshrut-6/",
  ),
  fromTable(
    {
      code: "7",
      slug: "7",
      kind: "bus",
      title: "Подкастельцы — ТСБ (через 9-ю проходную)",
      sourceUrl: "http://atp6voat.by/marshrut-%e2%84%967/",
      note: "Таблица АТП №6.",
    },
    { label: "Подкастельцы → ТСБ", stop: "podkasteltsy", column: 0 },
    { label: "ТСБ → Подкастельцы", stop: "tsb", column: 1 },
    T.BUS7_WD,
    T.BUS7_WE,
  ),
  fromTable(
    {
      code: "8",
      slug: "8",
      kind: "bus",
      title: "Подкастельцы — БВК",
      sourceUrl: "http://atp6voat.by/marshrut-%e2%84%968/",
      note: "Таблица АТП №6.",
    },
    { label: "Подкастельцы → БВК", stop: "podkasteltsy", column: [0, 2, 4] },
    { label: "БВК → Подкастельцы", stop: "bvk", column: [1, 3, 5] },
    T.BUS8_WD,
    T.BUS8_WE,
  ),
  {
    code: "9",
    slug: "9",
    kind: "bus",
    title: "Подкастельцы — 3-я проходная",
    sourceUrl: "http://atp6voat.by/marshrut-%e2%84%969/",
    note: "Упрощённо: отправления с Подкастельцев и 3-й проходной (будни и выходные).",
    directions: [
      {
        name: "Подкастельцы → 3-я проходная",
        trips: {
          weekdays: trips("podkasteltsy", [
            "05:59", "06:16", "06:44", "06:55", "07:05", "07:24", "07:38", "08:10", "08:55", "11:21", "12:45",
            "13:33", "14:36", "15:12", "15:42", "16:13", "16:19", "16:29", "16:42", "16:53", "19:10",
          ]),
          weekend: trips("podkasteltsy", ["07:00", "19:07"]),
        },
      },
      {
        name: "3-я проходная → Подкастельцы",
        trips: {
          weekdays: trips("proh3", [
            "06:47", "07:29", "07:50", "08:05", "08:16", "15:25", "15:35", "16:00", "16:28", "17:01", "17:15",
            "17:25", "17:38", "20:17", "20:20",
          ]),
          weekend: trips("proh3", ["08:17", "20:20"]),
        },
      },
      {
        name: "ст. Новополоцк → завод «Полимир»",
        trips: {
          weekdays: trips("st_novopolotsk", [
            "06:44", "07:26", "07:47", "08:02", "08:13", "15:22", "15:32", "15:57", "16:25", "16:58", "17:12",
            "17:22", "17:35",
          ]),
          weekend: trips("st_novopolotsk", ["08:14", "20:17"]),
        },
      },
      {
        name: "завод «Полимир» → ст. Новополоцк",
        trips: {
          weekdays: trips("polimir", [
            "06:50", "07:32", "07:53", "08:08", "08:19", "08:24", "08:52", "09:39", "12:15", "13:19", "14:07",
            "15:28", "15:38", "16:03", "16:31", "16:55", "17:04", "17:18", "17:28", "17:41", "20:23",
          ]),
          weekend: trips("polimir", ["08:20", "20:23"]),
        },
      },
    ],
  },
  fromTable(
    {
      code: "10",
      slug: "10",
      kind: "bus",
      title: "Новополоцк — Полоцк (через Ропно)",
      sourceUrl: "https://atp6voat.by/marshrut10s1iyulya/",
      note: "Стоимость проезда 1,15 рубля. С 06.07.2026.",
    },
    { label: "Автовокзал (Новополоцк) → Ж/д вокзал (Полоцк)", stop: "avtovokzal", column: [0, 2, 4] },
    { label: "Ж/д вокзал (Полоцк) → Автовокзал (Новополоцк)", stop: "jd_vokzal_polotsk", column: [1, 3, 5] },
    T.BUS10_WD,
    T.BUS10_WE,
  ),
  fromTable(
    {
      code: "10А",
      slug: "10a",
      kind: "bus",
      title: "Подкастельцы — Полоцк (через Ропно)",
      sourceUrl: "https://atp6voat.by/marshrut10as1iyulya/",
      note: "Стоимость проезда 1,15 рубля. С 06.07.2026.",
    },
    { label: "Подкастельцы → Ж/д вокзал (Полоцк)", stop: "podkasteltsy", column: [0, 2] },
    { label: "Ж/д вокзал (Полоцк) → Подкастельцы", stop: "jd_vokzal_polotsk", column: [1, 3] },
    T.BUS10A_WD,
    T.BUS10A_WE,
  ),
  {
    code: "11",
    slug: "11",
    kind: "bus",
    title: "Подкастельцы — Слободская",
    sourceUrl: "http://atp6voat.by/marshrut-%e2%84%9611/",
    note: "Только по рабочим дням.",
    directions: [
      multiStopDirection(
        "Подкастельцы → Автовокзал",
        BUS11_ROWS.map((row) => [
          { stop: "podkasteltsy", raw: row[0] },
          { stop: "polyclinic1", raw: row[1] },
          { stop: "gaydara", raw: row[2] },
          { stop: "avtovokzal", raw: row[3] },
        ]),
        "weekdays",
      ),
    ],
  },
  oneDirection(
    {
      code: "13",
      slug: "13",
      kind: "bus",
      title: "Ропнянская — Автовокзал",
      sourceUrl: "http://atp6voat.by/marshrut-%e2%84%9613/",
      note: "С 22.04.2026, по рабочим и выходным дням.",
    },
    "Ропнянская → Автовокзал",
    "ropnyanskaya",
    ["14:35"],
    ["14:35"],
  ),
  oneDirection(
    {
      code: "14",
      slug: "14",
      kind: "bus",
      title: "Ропнянская — Подкастельцы",
      sourceUrl: "http://atp6voat.by/marshrut-%e2%84%9614/",
      note: "С 22.04.2026, по рабочим и выходным дням.",
    },
    "Ропнянская → Подкастельцы",
    "ropnyanskaya",
    ["14:36"],
    ["14:36"],
  ),
  bareRoute("15", "15", "bus", "Новополоцк — Ксты", "Стоимость проезда 1,15 рубля.", ATP),
  bareRoute("16", "16", "bus", "Подкастельцы — Гайдара", "PDF АТП №6.", ATP),
  bareRoute(
    "19",
    "19",
    "bus",
    "Подкастельцы — Слободская",
    "По рабочим дням, с заездом к ул. Денисова и ТЦ «Зодиак».",
    ATP,
  ),
  fromTable(
    {
      code: "17",
      slug: "17",
      kind: "bus",
      title: "Подкастельцы — Весовая БВК",
      sourceUrl: "http://atp6voat.by/marshrut-%e2%84%9617/",
      note: "С 04.04.2026.",
    },
    { label: "Подкастельцы → Весовая БВК", stop: "podkasteltsy", column: 0 },
    { label: "Весовая БВК → Подкастельцы", stop: "vesovaya_bvk", column: 1 },
    T.BUS17_WD,
    T.BUS17_WE,
  ),
  {
    code: "18",
    slug: "18",
    kind: "bus",
    title: "Подкастельцы — 1-я палатка",
    sourceUrl: "http://atp6voat.by/marshrut-18/",
    note: "Рабочие дни и суббота (субботнее расписание в выходном шаблоне).",
    directions: [
      {
        name: "ул. Залюховская → 1-я палатка",
        trips: {
          weekdays: trips("zalyukhovskaya", ["07:03", "07:33", "08:55", "10:16", "12:55", "14:20", "15:50", "17:23"]),
          weekend: trips("zalyukhovskaya", ["07:03", "08:23", "10:16", "11:58", "13:28"]),
        },
      },
      {
        name: "1-я палатка → ул. Залюховская",
        trips: {
          weekdays: trips("palatka1", ["07:31", "08:01", "09:23", "10:44", "13:23", "14:48", "16:18", "17:51"]),
          weekend: trips("palatka1", ["07:31", "08:51", "10:44", "12:26", "13:56"]),
        },
      },
    ],
  },
  {
    code: "20",
    slug: "20",
    kind: "bus",
    title: "Луговая — Автовокзал",
    sourceUrl: "http://atp6voat.by/marshruty-20-20a/",
    note: "Маршрут №20, таблица АТП.",
    directions: [
      {
        name: "Луговая → Автовокзал",
        trips: {
          weekdays: trips("lugovaya", ["07:06", "09:46", "13:56", "15:50", "17:37", "20:22"]),
          weekend: trips("lugovaya", ["07:06", "09:46", "13:56", "17:37", "20:22"]),
        },
      },
      {
        name: "Автовокзал → Луговая",
        trips: {
          weekend: trips("avtovokzal", ["10:55", "14:28"]),
        },
      },
      {
        name: "Подкастельцы → Автовокзал",
        trips: {
          weekend: trips("podkasteltsy", ["08:40", "10:25", "11:48", "14:58"]),
        },
      },
    ],
  },
  {
    code: "20А",
    slug: "20a",
    kind: "bus",
    title: "Подкастельцы — Автовокзал (20А)",
    sourceUrl: "http://atp6voat.by/marshruty-20-20a/",
    note: "Маршрут №20А, таблица АТП.",
    directions: [
      {
        name: "Подкастельцы → Автовокзал",
        trips: {
          weekdays: trips("podkasteltsy", ["04:53", "07:36", "08:31", "15:36", "16:23", "17:38", "23:35"]),
          weekend: trips("podkasteltsy", ["04:45", "05:30", "07:36", "15:36", "23:35"]),
        },
      },
      {
        name: "Автовокзал → Подкастельцы",
        trips: {
          weekend: trips("avtovokzal", ["06:02"]),
        },
      },
    ],
  },
  bareRoute("21", "21", "bus", "Автовокзал — Междуречье", "См. общую таблицу с маршрутом №6.", "http://atp6voat.by/marshrut-6/"),
  twoDirections(
    {
      code: "21А",
      slug: "21a",
      kind: "bus",
      title: "Автовокзал — Междуречье-1",
      sourceUrl: "http://atp6voat.by/marshrut-21a/",
      note: "С 01.09.2026, по рабочим дням и субботам.",
    },
    { label: "Автовокзал → Междуречье-1", stop: "avtovokzal", weekdays: ["09:25", "12:55"], weekend: ["09:25", "12:55"] },
    { label: "Междуречье-1 → Автовокзал", stop: "mezhurechye1", weekdays: ["09:48", "13:20"], weekend: ["09:48", "13:20"] },
  ),
  oneDirection(
    {
      code: "22",
      slug: "22",
      kind: "bus",
      title: "Подкастельцы — Белсантехмонтаж",
      sourceUrl: "http://atp6voat.by/marshrut-%e2%84%9612/",
      note: "Только по рабочим дням.",
    },
    "Подкастельцы → Белсантехмонтаж",
    "podkasteltsy",
    ["17:23", "18:10", "19:17", "19:27", "19:50", "21:10", "00:18", "00:51"],
  ),
  bareRoute("2Тк", "2tk", "minibus", "Подкастельцы — ОАО «Нафтан»", "Будние дни. Расписание на vitoperator.by.", TAXI),
  bareRoute("4Тк", "4tk", "minibus", "Подкастельцы — Больничный городок", "Будние дни. Расписание на vitoperator.by.", TAXI),
  bareRoute("5Тк", "5tk", "minibus", "Новополоцк — Полоцк через Экимань", "Будние дни. Расписание на vitoperator.by.", TAXI),
];

export const ROUTES: RouteSeed[] = applyPdfOverrides(BASE_ROUTES);
