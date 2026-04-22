import type { DoneTask } from "./doneTask";

export type TrashPanel = {
  id: string;
  title: string;
  fromDate: string;
  toDate: string;
  color: string;
  items: DoneTask[];
  isCollapsed: boolean;
  isTitleCustom: boolean;
};
