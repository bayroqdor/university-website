import { createContext } from "react";
import { DICTS, type Dict } from "../lib/i18n";

/** Grafik boshqaruv tugmalari matnlari (sayt tili bo'yicha) */
export const ChartLabels = createContext<Dict>(DICTS.uz);
