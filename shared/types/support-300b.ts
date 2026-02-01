// Stub types for support-300b
export interface SupportArticle {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
}

export interface FAQEntry {
  question: string;
  answer: string;
  category: string;
}
