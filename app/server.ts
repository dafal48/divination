"use server";
import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createStreamableValue } from "ai/rsc";
import { ERROR_PREFIX } from "@/lib/constant";
import { GoogleGenerativeAI } from "@google/generative-ai";

// AI服务类型
const AI_TYPE = process.env.AI_TYPE || "openai"; // 默认使用OpenAI

// OpenAI配置
const openaiModel = process.env.OPENAI_MODEL ?? "gpt-3.5-turbo";
const openai = createOpenAI({ baseURL: process.env.OPENAI_BASE_URL });

// Google AI配置
const googleApiKey = process.env.GOOGLE_API_KEY;
const googleModel = process.env.GOOGLE_MODEL ?? "gemini-pro";
const googleAI = googleApiKey ? new GoogleGenerativeAI(googleApiKey) : null;

const STREAM_INTERVAL = 60;
const MAX_SIZE = 6;

export async function getAnswer(
  prompt: string,
  guaMark: string,
  guaTitle: string,
  guaResult: string,
  guaChange: string,
) {
  console.log(prompt, guaTitle, guaResult, guaChange);
  const stream = createStreamableValue();
  
  try {
    const res = await fetch(
      `https://raw.githubusercontent.com/sunls2/zhouyi/main/docs/${guaMark}/index.md`,
    );
    const guaDetail = await res.text();
    const explain = guaDetail
      .match(/(\*\*台灣張銘仁[\s\S]*?)(?=周易第\d+卦)/)?.[1]
      .replaceAll("\n\n", "\n");

    const changeList: string[] = [];
    if (guaChange !== "无变爻") {
      guaChange
        .split(":")[1]
        .trim()
        .split(",")
        .forEach((change) => {
          const detail = guaDetail
            .match(`(\\*\\*${change}變卦[\\s\\S]*?)(?=${guaTitle}|$)`)?.[1]
            .replaceAll("\n\n", "\n");
          if (detail) {
            changeList.push(detail.trim());
          }
        });
    }

    // 系统提示和用户提示内容
    const systemPrompt = `你是一位精通《周易》的AI助手，根据用户提供的卦象和问题，提供准确的卦象解读和实用建议
任务要求：逻辑清晰，语气得当
1. 解读卦象：分析主卦、变爻及变卦，解读整体趋势和吉凶
2. 关联问题：针对用户问题，结合卦象信息，提供具体分析
3. 提供建议：根据卦象启示，给出切实可行的建议，帮助用户解决实际问题`;

    const userPrompt = `我摇到的卦象：${guaTitle} ${guaResult} ${guaChange}
我的问题：${prompt}

${explain}
${changeList.join("\n")}`;

    let fullStream;
    
    // 根据环境变量中的AI类型选择不同的API
    if (AI_TYPE === "google" && googleAI) {
      // 使用Google AI
      const geminiModel = googleAI.getGenerativeModel({ model: googleModel });
      
      const geminiStream = await geminiModel.generateContentStream({
        contents: [
          { role: "user", parts: [{ text: systemPrompt + "\n\n" + userPrompt }] }
        ],
        generationConfig: {
          temperature: 0.5,
        },
      });
      
      // 初始化buffer处理逻辑
      let buffer = "";
      let done = false;
      const intervalId = setInterval(() => {
        if (done && buffer.length === 0) {
          clearInterval(intervalId);
          stream.done();
          return;
        }
        if (buffer.length <= MAX_SIZE) {
          stream.update(buffer);
          buffer = "";
        } else {
          const chunk = buffer.slice(0, MAX_SIZE);
          buffer = buffer.slice(MAX_SIZE);
          stream.update(chunk);
        }
      }, STREAM_INTERVAL);
      
      // 处理Google AI流式响应
      (async () => {
        try {
          for await (const chunk of geminiStream.stream) {
            const textChunk = chunk.text();
            buffer += textChunk;
          }
        } catch (err: any) {
          stream.update(ERROR_PREFIX + (err.message ?? err.toString()));
        } finally {
          done = true;
        }
      })().catch(console.error);
      
      return { data: stream.value };
    } else {
      // 使用OpenAI
      const { fullStream } = streamText({
        temperature: 0.5,
        model: openai(openaiModel),
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
        maxRetries: 0,
      });

      let buffer = "";
      let done = false;
      const intervalId = setInterval(() => {
        if (done && buffer.length === 0) {
          clearInterval(intervalId);
          stream.done();
          return;
        }
        if (buffer.length <= MAX_SIZE) {
          stream.update(buffer);
          buffer = "";
        } else {
          const chunk = buffer.slice(0, MAX_SIZE);
          buffer = buffer.slice(MAX_SIZE);
          stream.update(chunk);
        }
      }, STREAM_INTERVAL);

      (async () => {
        for await (const part of fullStream) {
          switch (part.type) {
            case "text-delta":
              buffer += part.textDelta;
              break;
            case "error":
              const err = part.error as any;
              stream.update(ERROR_PREFIX + (err.message ?? err.toString()));
              break;
          }
        }
      })()
        .catch(console.error)
        .finally(() => {
          done = true;
        });

      return { data: stream.value };
    }
  } catch (err: any) {
    stream.done();
    return { error: err.message ?? err };
  }
}
