// Types for the Supabase schema in supabase/migrations.
//
// Hand-maintained for now, in the shape `supabase gen types typescript`
// produces, so it can be replaced by the generated file without touching
// call sites. Keep in sync with the migrations.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ResearchStatus =
  | "pending"
  | "planning"
  | "collecting"
  | "processing"
  | "analyzing"
  | "resolving"
  | "completed"
  | "failed";

export type EventLevel = "info" | "warning" | "error";

export type Database = {
  public: {
    Tables: {
      researches: {
        Row: {
          id: string;
          user_id: string | null;
          query: string;
          focus: string | null;
          status: ResearchStatus;
          error_message: string | null;
          created_at: string;
          updated_at: string;
          completed_at: string | null;
          constraints: Json | null;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          query: string;
          focus?: string | null;
          status?: ResearchStatus;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
          constraints?: Json | null;
        };
        Update: Partial<Database["public"]["Tables"]["researches"]["Insert"]>;
        Relationships: [];
      };
      sources: {
        Row: {
          id: string;
          research_id: string;
          url: string;
          canonical_url: string;
          title: string | null;
          publisher: string | null;
          published_at: string | null;
          source_type: string;
          extracted_text: string | null;
          metadata: Json;
          duplicate_of: string | null;
          relevance_score: number | null;
          is_relevant: boolean | null;
          relevance_label: "direct" | "contextual" | "irrelevant" | null;
          relevance_reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          research_id: string;
          url: string;
          canonical_url: string;
          title?: string | null;
          publisher?: string | null;
          published_at?: string | null;
          source_type: string;
          extracted_text?: string | null;
          metadata?: Json;
          duplicate_of?: string | null;
          relevance_score?: number | null;
          is_relevant?: boolean | null;
          relevance_label?: "direct" | "contextual" | "irrelevant" | null;
          relevance_reason?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["sources"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "sources_research_id_fkey";
            columns: ["research_id"];
            isOneToOne: false;
            referencedRelation: "researches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sources_duplicate_of_fkey";
            columns: ["duplicate_of"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["id"];
          },
        ];
      };
      entities: {
        Row: {
          id: string;
          research_id: string;
          name: string;
          entity_type: string;
          domain: string | null;
          country: string | null;
          description: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          research_id: string;
          name: string;
          entity_type?: string;
          domain?: string | null;
          country?: string | null;
          description?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["entities"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "entities_research_id_fkey";
            columns: ["research_id"];
            isOneToOne: false;
            referencedRelation: "researches";
            referencedColumns: ["id"];
          },
        ];
      };
      findings: {
        Row: {
          id: string;
          research_id: string;
          entity_id: string | null;
          type: string;
          title: string;
          summary: string | null;
          occurred_at: string | null;
          confidence: number | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          research_id: string;
          entity_id?: string | null;
          type: string;
          title: string;
          summary?: string | null;
          occurred_at?: string | null;
          confidence?: number | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["findings"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "findings_research_id_fkey";
            columns: ["research_id"];
            isOneToOne: false;
            referencedRelation: "researches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "findings_entity_id_fkey";
            columns: ["entity_id"];
            isOneToOne: false;
            referencedRelation: "entities";
            referencedColumns: ["id"];
          },
        ];
      };
      finding_sources: {
        Row: {
          finding_id: string;
          source_id: string;
          excerpt: string | null;
          created_at: string;
        };
        Insert: {
          finding_id: string;
          source_id: string;
          excerpt?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["finding_sources"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "finding_sources_finding_id_fkey";
            columns: ["finding_id"];
            isOneToOne: false;
            referencedRelation: "findings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "finding_sources_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["id"];
          },
        ];
      };
      reports: {
        Row: {
          id: string;
          research_id: string;
          overview: string;
          key_takeaways: Json;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          research_id: string;
          overview: string;
          key_takeaways?: Json;
          metadata?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["reports"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "reports_research_id_fkey";
            columns: ["research_id"];
            isOneToOne: true;
            referencedRelation: "researches";
            referencedColumns: ["id"];
          },
        ];
      };
      research_events: {
        Row: {
          id: number;
          research_id: string;
          stage: string;
          level: EventLevel;
          message: string;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          research_id: string;
          stage: string;
          level?: EventLevel;
          message: string;
          metadata?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["research_events"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "research_events_research_id_fkey";
            columns: ["research_id"];
            isOneToOne: false;
            referencedRelation: "researches";
            referencedColumns: ["id"];
          },
        ];
      };
      provider_cache: {
        Row: {
          provider: string;
          cache_key: string;
          response: Json;
          fetched_at: string;
          expires_at: string;
        };
        Insert: {
          provider: string;
          cache_key: string;
          response: Json;
          fetched_at?: string;
          expires_at: string;
        };
        Update: Partial<Database["public"]["Tables"]["provider_cache"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      save_research_analysis: {
        Args: { p_research_id: string; p_analysis: Json };
        Returns: string;
      };
    };
    Enums: {
      research_status: ResearchStatus;
    };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
