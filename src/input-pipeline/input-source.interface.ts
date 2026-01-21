/**
 * Represents a unified input source after processing
 * This abstraction allows any type of input (file, text, audio, video, URL)
 * to be processed uniformly by the generation strategies
 */
export interface InputSource {
  /** Type of input source */
  type: InputSourceType;

  /** Extracted/processed content as string */
  content: string;

  /** Additional metadata about the source */
  metadata: {
    /** Original filename (for files) */
    originalName?: string;

    /** URL of the source (for files, audio, video, URLs) */
    url?: string;

    /** Duration in seconds (for audio/video) */
    duration?: number;

    /** MIME type (for files) */
    fileType?: string;

    /** Detected language (for audio/video transcriptions) */
    language?: string;

    /** Allow additional custom metadata */
    [key: string]: any;
  };
}

/**
 * Enumeration of supported input source types
 *
 * Precedence order: FILE > CONTENT > TITLE
 * When multiple types are present, higher precedence sources override lower ones
 */
export enum InputSourceType {
  /** Title or topic string */
  TITLE = 'title',

  /** Raw text content */
  CONTENT = 'content',

  /** Uploaded file (PDF, DOCX, etc.) */
  FILE = 'file',

  /** Audio file URL (for transcription) */
  AUDIO = 'audio',

  /** Video file URL (for transcript + visual extraction) */
  VIDEO = 'video',

  /** Web page URL (for scraping) */
  URL = 'url',
}
