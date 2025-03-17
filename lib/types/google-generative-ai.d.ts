declare module '@google/generative-ai' {
  export class GoogleGenerativeAI {
    constructor(apiKey: string);
    getGenerativeModel(options: { model: string }): GenerativeModel;
  }

  export interface GenerativeModel {
    generateContentStream(options: {
      contents: Array<{
        role: string;
        parts: Array<{
          text: string;
        }>;
      }>;
      generationConfig?: {
        temperature?: number;
      };
    }): Promise<GenerativeContentResult>;
  }

  export interface GenerativeContentResult {
    stream: AsyncIterable<ContentPart>;
  }

  export interface ContentPart {
    text(): string;
  }
} 