import { MONETIZATION_SPLITS, SPLITS } from "../../../config/monetizationSplits";

export interface SupportArticle  {
    id: string;
    title: string;
    content: string;
    category: string;
    tags: string[];
  [key: string]: any;
}
export interface FAQEntry  {
    question: string;
    answer: string;
    category: string;
  [key: string]: any;
}


























