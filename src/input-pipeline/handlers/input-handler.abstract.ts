import { InputSource } from '../input-source.interface';

/**
 * Abstract base class for input handlers
 * Implements Chain of Responsibility pattern
 *
 * Each handler:
 * 1. Checks if it can process the DTO (canHandle)
 * 2. Processes the input if applicable (processInput)
 * 3. Delegates to the next handler in the chain
 */
export abstract class InputHandler {
  protected nextHandler: InputHandler | null = null;

  /**
   * Set the next handler in the chain
   * @returns The next handler (for chaining)
   */
  setNext(handler: InputHandler): InputHandler {
    this.nextHandler = handler;
    return handler;
  }

  /**
   * Handle the input DTO
   * Processes if canHandle returns true, then delegates to next handler
   *
   * @param dto Input data transfer object
   * @returns Array of processed input sources
   */
  async handle(dto: any): Promise<InputSource[]> {
    const sources: InputSource[] = [];

    // Process current handler if it can handle
    if (await this.canHandle(dto)) {
      const processed = await this.processInput(dto);
      sources.push(...processed);
    }

    // Delegate to next handler in chain
    if (this.nextHandler) {
      const nextSources = await this.nextHandler.handle(dto);
      sources.push(...nextSources);
    }

    return sources;
  }

  /**
   * Check if this handler can process the given DTO
   * @param dto Input data transfer object
   * @returns True if this handler should process the DTO
   */
  protected abstract canHandle(dto: any): boolean | Promise<boolean>;

  /**
   * Process the input and return InputSource array
   * Only called if canHandle returns true
   *
   * @param dto Input data transfer object
   * @returns Array of processed input sources
   */
  protected abstract processInput(dto: any): Promise<InputSource[]>;
}
