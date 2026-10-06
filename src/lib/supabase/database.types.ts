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
          service_category_slug: string | null;
          product_category_slug: string | null;
          service_mode: "at_provider" | "mobile" | "remote" | "farm_visit" | null;
          provider_location_id: string | null;
          service_city: string | null;
          service_locality: string | null;
          public_image_url: string | null;
          legal_review_status: "not_required" | "pending" | "approved" | "rejected";
          service_duration_minutes: number | null;
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
          service_category_slug?: string | null;
          product_category_slug?: string | null;
          service_mode?: "at_provider" | "mobile" | "remote" | "farm_visit" | null;
          provider_location_id?: string | null;
          service_city?: string | null;
          service_locality?: string | null;
          public_image_url?: string | null;
          legal_review_status?: "not_required" | "pending" | "approved" | "rejected";
          service_duration_minutes?: number | null;
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
      service_categories: {
        Row: {
          slug: string;
          name: string;
          parent_slug: string | null;
          allowed_provider_types: string[];
          requires_professional_verification: boolean;
          requires_legal_review: boolean;
          is_active: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          slug: string;
          name: string;
          parent_slug?: string | null;
          allowed_provider_types?: string[];
          requires_professional_verification?: boolean;
          requires_legal_review?: boolean;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["service_categories"]["Insert"]>;
        Relationships: [];
      };
      product_categories: {
        Row: {
          slug: string;
          name: string;
          parent_slug: string | null;
          requires_legal_review: boolean;
          is_active: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          slug: string;
          name: string;
          parent_slug?: string | null;
          requires_legal_review?: boolean;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["product_categories"]["Insert"]>;
        Relationships: [];
      };
      provider_profiles: {
        Row: {
          business_id: string;
          slug: string;
          provider_type: string;
          biography: string;
          public_email: string | null;
          public_phone: string | null;
          website_url: string | null;
          professional_verification_status: string;
          professional_verified_at: string | null;
          profile_published_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          business_id: string;
          slug: string;
          provider_type: string;
          biography?: string;
          public_email?: string | null;
          public_phone?: string | null;
          website_url?: string | null;
          professional_verification_status?: string;
          professional_verified_at?: string | null;
          profile_published_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["provider_profiles"]["Insert"]>;
        Relationships: [];
      };
      provider_locations: {
        Row: {
          id: string;
          business_id: string;
          label: string;
          address_line: string | null;
          city: string;
          locality: string | null;
          postal_code: string | null;
          country_code: string;
          location: unknown;
          service_radius_m: number | null;
          is_primary: boolean;
          is_public: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          label?: string;
          address_line?: string | null;
          city: string;
          locality?: string | null;
          postal_code?: string | null;
          country_code?: string;
          location: unknown;
          service_radius_m?: number | null;
          is_primary?: boolean;
          is_public?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["provider_locations"]["Insert"]>;
        Relationships: [];
      };
      service_availability_rules: {
        Row: {
          id: string;
          listing_id: string;
          day_of_week: number;
          opens_at: string;
          closes_at: string;
          timezone: string;
          slot_interval_minutes: number | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          listing_id: string;
          day_of_week: number;
          opens_at: string;
          closes_at: string;
          timezone?: string;
          slot_interval_minutes?: number | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["service_availability_rules"]["Insert"]>;
        Relationships: [];
      };
      service_availability_exceptions: {
        Row: {
          id: string;
          listing_id: string;
          service_date: string;
          is_available: boolean;
          opens_at: string | null;
          closes_at: string | null;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          listing_id: string;
          service_date: string;
          is_available?: boolean;
          opens_at?: string | null;
          closes_at?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["service_availability_exceptions"]["Insert"]>;
        Relationships: [];
      };
      pets: {
        Row: {
          id: string;
          customer_id: string;
          name: string;
          species: string;
          breed: string | null;
          date_of_birth: string | null;
          sex: "female" | "male" | "unknown" | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          name: string;
          species: string;
          breed?: string | null;
          date_of_birth?: string | null;
          sex?: "female" | "male" | "unknown" | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["pets"]["Insert"]>;
        Relationships: [];
      };
      saved_listings: {
        Row: { customer_id: string; listing_id: string; created_at: string };
        Insert: { customer_id: string; listing_id: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["saved_listings"]["Insert"]>;
        Relationships: [];
      };
      listing_reviews: {
        Row: {
          id: string;
          listing_id: string;
          customer_id: string;
          booking_id: string | null;
          rating: number;
          review_text: string;
          status: "pending" | "published" | "rejected";
          created_at: string;
        };
        Insert: {
          id?: string;
          listing_id: string;
          customer_id: string;
          booking_id?: string | null;
          rating: number;
          review_text?: string;
          status?: "pending" | "published" | "rejected";
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["listing_reviews"]["Insert"]>;
        Relationships: [];
      };
      bookings: {
        Row: {
          id: string;
          customer_id: string;
          provider_business_id: string;
          listing_id: string | null;
          appointment_slot_id: string | null;
          pet_id: string | null;
          status: "requested" | "accepted" | "awaiting_payment" | "confirmed" | "declined" | "expired" | "cancelled" | "completed" | "refunded";
          requested_start: string;
          requested_end: string;
          amount_paise: number | null;
          provider_timezone: string;
          cancellation_terms_snapshot: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          provider_business_id: string;
          listing_id?: string | null;
          appointment_slot_id?: string | null;
          pet_id?: string | null;
          status?: "requested" | "accepted" | "awaiting_payment" | "confirmed" | "declined" | "expired" | "cancelled" | "completed" | "refunded";
          requested_start: string;
          requested_end: string;
          amount_paise?: number | null;
          provider_timezone?: string;
          cancellation_terms_snapshot?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["bookings"]["Insert"]>;
        Relationships: [];
      };
      provider_appointment_slots: {
        Row: {
          id: string;
          listing_id: string;
          starts_at: string;
          ends_at: string;
          timezone: string;
          status: "available" | "held" | "booked" | "blocked";
          held_until: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          listing_id: string;
          starts_at: string;
          ends_at: string;
          timezone?: string;
          status?: "available" | "held" | "booked" | "blocked";
          held_until?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["provider_appointment_slots"]["Insert"]>;
        Relationships: [];
      };
      booking_events: {
        Row: {
          id: string;
          booking_id: string;
          from_status: string | null;
          to_status: string;
          actor_profile_id: string | null;
          event_note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          booking_id: string;
          from_status?: string | null;
          to_status: string;
          actor_profile_id?: string | null;
          event_note?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["booking_events"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      search_services_nearby: {
        Args: {
          p_latitude: number;
          p_longitude: number;
          p_radius_m?: number;
          p_category_slug?: string | null;
        };
        Returns: Array<{
          listing_id: string;
          business_id: string;
          provider_slug: string;
          title: string;
          category_slug: string | null;
          service_city: string | null;
          service_locality: string | null;
          price_paise: number | null;
          distance_m: number;
        }>;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
