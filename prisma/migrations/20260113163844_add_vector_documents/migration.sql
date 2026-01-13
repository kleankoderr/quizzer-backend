-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create vector documents table
CREATE TABLE vector_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  embedding vector(768), -- Google embeddings are 768-dimensional
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_vector_embedding ON vector_documents 
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX idx_vector_metadata ON vector_documents USING gin(metadata);

-- Create indexes for common filter patterns
CREATE INDEX idx_vector_user_id ON vector_documents ((metadata->>'userId'));
CREATE INDEX idx_vector_topic ON vector_documents ((metadata->>'topic'));
CREATE INDEX idx_vector_school_id ON vector_documents ((metadata->>'schoolId'));

-- Update trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_vector_documents_updated_at 
  BEFORE UPDATE ON vector_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();