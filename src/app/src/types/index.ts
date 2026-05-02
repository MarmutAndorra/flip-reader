export interface WordFlip {
    id: string;
    term: string;                
    partOfSpeech: string;        
    definition: string;          
    originalSentence: string;    
    sentenceTranslation: string; 
    aiExamples: string[];        
    isSaved: boolean;            
    createdAt: number;
  }