import type { Category } from "./category";

export type Task = {
  id: string;
  title: string;

  categoryId: Category["id"];
  categoryName: Category["name"];

  isDone: boolean;

  createdAt: string;
  updatedAt: string;
};
