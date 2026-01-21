import { Module } from '@nestjs/common';
import { InputPipeline } from './input-pipeline.service';
import { TitleInputHandler } from './handlers/title-input.handler';
import { ContentInputHandler } from './handlers/content-input.handler';
import { FileInputHandler } from './handlers/file-input.handler';
import { RagModule } from '../rag/rag.module';
import { UserDocumentModule } from '../user-document/user-document.module';

@Module({
  imports: [
    RagModule,
    UserDocumentModule,
  ],
  providers: [
    TitleInputHandler,
    ContentInputHandler,
    FileInputHandler,

    // Pipeline with handler registration
    {
      provide: InputPipeline,
      useFactory: (
        titleHandler: TitleInputHandler,
        contentHandler: ContentInputHandler,
        fileHandler: FileInputHandler
      ) => {
        const pipeline = new InputPipeline();

        // Register handlers in order
        // Order doesn't affect precedence (that's handled in combineInputSources)
        // but this determines processing order
        pipeline.registerHandlers([titleHandler, contentHandler, fileHandler]);

        return pipeline;
      },
      inject: [TitleInputHandler, ContentInputHandler, FileInputHandler],
    },
  ],
  exports: [InputPipeline],
})
export class InputPipelineModule {}
