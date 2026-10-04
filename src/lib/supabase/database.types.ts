export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      businesses: {
        Row: {
          id: string;
          owner_id: string;
          kind: "seller" | "provider" | "seller_provider";
          display_name: string;
          legal_name: string | null;
          country_code: string;
          verification_status: "pending" | "in_review" | "verified" | "rejected" | "suspended";
          verification_notes: string | null;
          verified_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          kind: "seller" | "provider" | "seller_provider";
          display_name: string;
          legal_name?: string | null;
          country_code?: string;
          verification_status?: "pending" | "in_review" | "verified" | "rejected" | "suspended";
          verification_notes?: string | null;
          verified_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["businesses"]["Insert"]>;
        Relationships: [];
      };
      listings: {
        Row: {
          id: string;
          business_id: string;
          kind: "product" | "service";
          category: string;
          title: string;
          description: string;
          return_policy: string | null;
          price_paise: number | null;
          currency: string;
          country_code: string;
          status: "draft" | "submitted" | "published" | "rejected" | "archived";
          service_area: unknown | null;
          service_radius_m: number | null;
          moderation_notes: string | null;
          moderated_by: string | null;
          moderated_at: string | null;
          published_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          kind: "product" | "service";
          category: string;
          title: string;
          description?: string;
          return_policy?: string | null;
          price_paise?: number | null;
          currency?: string;
          country_code?: string;
          status?: "draft" | "submitted" | "published" | "rejected" | "archived";
          service_area?: unknown | null;
          service_radius_m?: number | null;
          moderation_notes?: string | null;
          moderated_by?: string | null;
          moderated_at?: string | null;
          published_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["listings"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
