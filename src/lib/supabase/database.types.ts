export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      addresses: {
        Row: {
          address_line1: string
          address_line2: string | null
          city: string
          country_code: string
          created_at: string
          id: string
          is_default: boolean
          label: string | null
          latitude: number | null
          locality: string | null
          longitude: number | null
          phone: string | null
          postal_code: string | null
          profile_id: string
          recipient_name: string
          state_region: string | null
          updated_at: string
        }
        Insert: {
          address_line1: string
          address_line2?: string | null
          city: string
          country_code?: string
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string | null
          latitude?: number | null
          locality?: string | null
          longitude?: number | null
          phone?: string | null
          postal_code?: string | null
          profile_id: string
          recipient_name: string
          state_region?: string | null
          updated_at?: string
        }
        Update: {
          address_line1?: string
          address_line2?: string | null
          city?: string
          country_code?: string
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string | null
          latitude?: number | null
          locality?: string | null
          longitude?: number | null
          phone?: string | null
          postal_code?: string | null
          profile_id?: string
          recipient_name?: string
          state_region?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "addresses_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      animal_species: {
        Row: {
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          parent_id: string | null
          slug: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          is_active?: boolean
          parent_id?: string | null
          slug: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean
          parent_id?: string | null
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "animal_species_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "animal_species"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_slots: {
        Row: {
          created_at: string
          ends_at: string
          hold_expires_at: string | null
          id: string
          service_listing_id: string
          starts_at: string
          status: string
        }
        Insert: {
          created_at?: string
          ends_at: string
          hold_expires_at?: string | null
          id?: string
          service_listing_id: string
          starts_at: string
          status?: string
        }
        Update: {
          created_at?: string
          ends_at?: string
          hold_expires_at?: string | null
          id?: string
          service_listing_id?: string
          starts_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_slots_service_listing_id_fkey"
            columns: ["service_listing_id"]
            isOneToOne: false
            referencedRelation: "service_offerings"
            referencedColumns: ["listing_id"]
          },
        ]
      }
      bookings: {
        Row: {
          appointment_slot_id: string | null
          cancellation_policy_snapshot: string | null
          created_at: string
          currency_code: string
          customer_profile_id: string
          id: string
          price_minor: number
          provider_business_id: string
          provider_location_id: string | null
          requested_end: string
          requested_start: string
          service_listing_id: string
          status: string
          updated_at: string
        }
        Insert: {
          appointment_slot_id?: string | null
          cancellation_policy_snapshot?: string | null
          created_at?: string
          currency_code: string
          customer_profile_id: string
          id?: string
          price_minor?: number
          provider_business_id: string
          provider_location_id?: string | null
          requested_end: string
          requested_start: string
          service_listing_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          appointment_slot_id?: string | null
          cancellation_policy_snapshot?: string | null
          created_at?: string
          currency_code?: string
          customer_profile_id?: string
          id?: string
          price_minor?: number
          provider_business_id?: string
          provider_location_id?: string | null
          requested_end?: string
          requested_start?: string
          service_listing_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_appointment_slot_id_fkey"
            columns: ["appointment_slot_id"]
            isOneToOne: false
            referencedRelation: "appointment_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_customer_profile_id_fkey"
            columns: ["customer_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_provider_business_id_fkey"
            columns: ["provider_business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_provider_location_id_fkey"
            columns: ["provider_location_id"]
            isOneToOne: false
            referencedRelation: "provider_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_service_listing_id_fkey"
            columns: ["service_listing_id"]
            isOneToOne: false
            referencedRelation: "service_offerings"
            referencedColumns: ["listing_id"]
          },
        ]
      }
      business_memberships: {
        Row: {
          business_id: string
          created_at: string
          member_role: string
          membership_status: string
          profile_id: string
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          member_role?: string
          membership_status?: string
          profile_id: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          member_role?: string
          membership_status?: string
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_memberships_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_memberships_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      business_verification_records: {
        Row: {
          business_id: string
          created_at: string
          id: string
          private_document_reference: string | null
          reviewed_at: string | null
          reviewer_profile_id: string | null
          status: string
          verification_type: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          private_document_reference?: string | null
          reviewed_at?: string | null
          reviewer_profile_id?: string | null
          status?: string
          verification_type: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          private_document_reference?: string | null
          reviewed_at?: string | null
          reviewer_profile_id?: string | null
          status?: string
          verification_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_verification_records_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_verification_records_reviewer_profile_id_fkey"
            columns: ["reviewer_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          archived_at: string | null
          business_type: string
          country_code: string
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          legal_name: string | null
          public_email: string | null
          public_phone: string | null
          updated_at: string
          verification_status: string
          website_url: string | null
        }
        Insert: {
          archived_at?: string | null
          business_type?: string
          country_code?: string
          created_at?: string
          display_name: string
          id?: string
          is_active?: boolean
          legal_name?: string | null
          public_email?: string | null
          public_phone?: string | null
          updated_at?: string
          verification_status?: string
          website_url?: string | null
        }
        Update: {
          archived_at?: string | null
          business_type?: string
          country_code?: string
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean
          legal_name?: string | null
          public_email?: string | null
          public_phone?: string | null
          updated_at?: string
          verification_status?: string
          website_url?: string | null
        }
        Relationships: []
      }
      cart_items: {
        Row: {
          cart_id: string
          created_at: string
          id: string
          listing_id: string
          product_variant_id: string | null
          quantity: number
          updated_at: string
        }
        Insert: {
          cart_id: string
          created_at?: string
          id?: string
          listing_id: string
          product_variant_id?: string | null
          quantity: number
          updated_at?: string
        }
        Update: {
          cart_id?: string
          created_at?: string
          id?: string
          listing_id?: string
          product_variant_id?: string | null
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_product_variant_id_fkey"
            columns: ["product_variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      carts: {
        Row: {
          created_at: string
          currency_code: string
          id: string
          market_code: string
          profile_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency_code: string
          id?: string
          market_code: string
          profile_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency_code?: string
          id?: string
          market_code?: string
          profile_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "carts_market_code_fkey"
            columns: ["market_code"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["country_code"]
          },
          {
            foreignKeyName: "carts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          id: string
          kind: string
          moderation_status: string
          name: string
          parent_id: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          moderation_status?: string
          name: string
          parent_id?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          moderation_status?: string
          name?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      category_species: {
        Row: {
          category_id: string
          species_id: string
        }
        Insert: {
          category_id: string
          species_id: string
        }
        Update: {
          category_id?: string
          species_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_species_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_species_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "animal_species"
            referencedColumns: ["id"]
          },
        ]
      }
      favourites: {
        Row: {
          created_at: string
          listing_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          listing_id: string
          profile_id: string
        }
        Update: {
          created_at?: string
          listing_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favourites_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favourites_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fulfilment_items: {
        Row: {
          created_at: string
          fulfilment_id: string
          id: string
          order_item_id: string
          quantity_shipped: number
        }
        Insert: {
          created_at?: string
          fulfilment_id: string
          id?: string
          order_item_id: string
          quantity_shipped: number
        }
        Update: {
          created_at?: string
          fulfilment_id?: string
          id?: string
          order_item_id?: string
          quantity_shipped?: number
        }
        Relationships: [
          {
            foreignKeyName: "fulfilment_items_fulfilment_id_fkey"
            columns: ["fulfilment_id"]
            isOneToOne: false
            referencedRelation: "fulfilments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fulfilment_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      fulfilments: {
        Row: {
          business_id: string
          carrier: string | null
          created_at: string
          delivered_at: string | null
          id: string
          order_id: string
          shipped_at: string | null
          status: string
          tracking_reference: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          carrier?: string | null
          created_at?: string
          delivered_at?: string | null
          id?: string
          order_id: string
          shipped_at?: string | null
          status?: string
          tracking_reference?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          carrier?: string | null
          created_at?: string
          delivered_at?: string | null
          id?: string
          order_id?: string
          shipped_at?: string | null
          status?: string
          tracking_reference?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fulfilments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fulfilments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_levels: {
        Row: {
          business_id: string
          id: string
          low_stock_threshold: number | null
          product_variant_id: string
          quantity_on_hand: number
          quantity_reserved: number
          stock_location: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          id?: string
          low_stock_threshold?: number | null
          product_variant_id: string
          quantity_on_hand?: number
          quantity_reserved?: number
          stock_location?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          id?: string
          low_stock_threshold?: number | null
          product_variant_id?: string
          quantity_on_hand?: number
          quantity_reserved?: number
          stock_location?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_levels_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_levels_product_variant_id_fkey"
            columns: ["product_variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          actor_profile_id: string | null
          created_at: string
          id: string
          inventory_level_id: string | null
          product_variant_id: string
          quantity_change: number
          reason: string
          related_order_item_id: string | null
        }
        Insert: {
          actor_profile_id?: string | null
          created_at?: string
          id?: string
          inventory_level_id?: string | null
          product_variant_id: string
          quantity_change: number
          reason: string
          related_order_item_id?: string | null
        }
        Update: {
          actor_profile_id?: string | null
          created_at?: string
          id?: string
          inventory_level_id?: string | null
          product_variant_id?: string
          quantity_change?: number
          reason?: string
          related_order_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_inventory_level_id_fkey"
            columns: ["inventory_level_id"]
            isOneToOne: false
            referencedRelation: "inventory_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_order_item_fk"
            columns: ["related_order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_product_variant_id_fkey"
            columns: ["product_variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_images: {
        Row: {
          alt_text: string | null
          created_at: string
          id: string
          listing_id: string
          sort_order: number
          storage_object_path: string
          updated_at: string
          visibility_status: string
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          id?: string
          listing_id: string
          sort_order?: number
          storage_object_path: string
          updated_at?: string
          visibility_status?: string
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          id?: string
          listing_id?: string
          sort_order?: number
          storage_object_path?: string
          updated_at?: string
          visibility_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_images_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_markets: {
        Row: {
          availability_status: string
          compliance_status: string
          listing_id: string
          market_code: string
        }
        Insert: {
          availability_status?: string
          compliance_status?: string
          listing_id: string
          market_code: string
        }
        Update: {
          availability_status?: string
          compliance_status?: string
          listing_id?: string
          market_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_markets_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_markets_market_code_fkey"
            columns: ["market_code"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["country_code"]
          },
        ]
      }
      listing_prices: {
        Row: {
          amount_minor: number
          created_at: string
          currency_code: string
          id: string
          listing_id: string
          market_code: string
          product_variant_id: string | null
          status: string
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          amount_minor: number
          created_at?: string
          currency_code: string
          id?: string
          listing_id: string
          market_code: string
          product_variant_id?: string | null
          status?: string
          valid_from?: string
          valid_to?: string | null
        }
        Update: {
          amount_minor?: number
          created_at?: string
          currency_code?: string
          id?: string
          listing_id?: string
          market_code?: string
          product_variant_id?: string | null
          status?: string
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listing_prices_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_prices_market_code_fkey"
            columns: ["market_code"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["country_code"]
          },
          {
            foreignKeyName: "listing_prices_variant_fk"
            columns: ["product_variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_species: {
        Row: {
          listing_id: string
          species_id: string
        }
        Insert: {
          listing_id: string
          species_id: string
        }
        Update: {
          listing_id?: string
          species_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_species_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_species_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "animal_species"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          archived_at: string | null
          business_id: string
          category_id: string
          created_at: string
          description: string | null
          id: string
          kind: string
          moderated_at: string | null
          moderated_by: string | null
          moderation_status: string
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          business_id: string
          category_id: string
          created_at?: string
          description?: string | null
          id?: string
          kind: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_status?: string
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          business_id?: string
          category_id?: string
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_status?: string
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "listings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_moderated_by_fkey"
            columns: ["moderated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      markets: {
        Row: {
          country_code: string
          created_at: string
          currency_code: string
          locale: string | null
          market_status: string
          tax_configuration_ref: string | null
          timezone: string | null
          updated_at: string
        }
        Insert: {
          country_code: string
          created_at?: string
          currency_code: string
          locale?: string | null
          market_status?: string
          tax_configuration_ref?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          country_code?: string
          created_at?: string
          currency_code?: string
          locale?: string | null
          market_status?: string
          tax_configuration_ref?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          business_id: string
          created_at: string
          currency_code: string
          id: string
          listing_id: string
          order_id: string
          product_variant_id: string | null
          quantity: number
          seller_sku_snapshot: string | null
          title_snapshot: string
          unit_price_minor: number
        }
        Insert: {
          business_id: string
          created_at?: string
          currency_code: string
          id?: string
          listing_id: string
          order_id: string
          product_variant_id?: string | null
          quantity: number
          seller_sku_snapshot?: string | null
          title_snapshot: string
          unit_price_minor: number
        }
        Update: {
          business_id?: string
          created_at?: string
          currency_code?: string
          id?: string
          listing_id?: string
          order_id?: string
          product_variant_id?: string | null
          quantity?: number
          seller_sku_snapshot?: string | null
          title_snapshot?: string
          unit_price_minor?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_variant_id_fkey"
            columns: ["product_variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          currency_code: string
          customer_profile_id: string
          delivery_address_snapshot: Json | null
          delivery_minor: number
          id: string
          market_code: string
          order_status: string
          subtotal_minor: number
          tax_minor: number
          total_minor: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency_code: string
          customer_profile_id: string
          delivery_address_snapshot?: Json | null
          delivery_minor?: number
          id?: string
          market_code: string
          order_status?: string
          subtotal_minor?: number
          tax_minor?: number
          total_minor?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency_code?: string
          customer_profile_id?: string
          delivery_address_snapshot?: Json | null
          delivery_minor?: number
          id?: string
          market_code?: string
          order_status?: string
          subtotal_minor?: number
          tax_minor?: number
          total_minor?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_profile_id_fkey"
            columns: ["customer_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_market_code_fkey"
            columns: ["market_code"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["country_code"]
          },
        ]
      }
      payments: {
        Row: {
          amount_minor: number
          booking_id: string | null
          created_at: string
          currency_code: string
          customer_profile_id: string
          id: string
          order_id: string | null
          provider: string
          provider_payment_reference: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_minor: number
          booking_id?: string | null
          created_at?: string
          currency_code: string
          customer_profile_id: string
          id?: string
          order_id?: string | null
          provider: string
          provider_payment_reference?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount_minor?: number
          booking_id?: string | null
          created_at?: string
          currency_code?: string
          customer_profile_id?: string
          id?: string
          order_id?: string | null
          provider?: string
          provider_payment_reference?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_booking_fk"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_customer_profile_id_fkey"
            columns: ["customer_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          active_status: boolean
          barcode: string | null
          created_at: string
          id: string
          listing_id: string
          option_attributes: Json
          seller_sku: string
          updated_at: string
        }
        Insert: {
          active_status?: boolean
          barcode?: string | null
          created_at?: string
          id?: string
          listing_id: string
          option_attributes?: Json
          seller_sku: string
          updated_at?: string
        }
        Update: {
          active_status?: boolean
          barcode?: string | null
          created_at?: string
          id?: string
          listing_id?: string
          option_attributes?: Json
          seller_sku?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          full_name: string | null
          id: string
          phone: string | null
          role: string | null
        }
        Insert: {
          created_at?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          role?: string | null
        }
        Update: {
          created_at?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          role?: string | null
        }
        Relationships: []
      }
      provider_locations: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          business_id: string
          city: string | null
          country_code: string
          created_at: string
          id: string
          is_active: boolean
          is_public: boolean
          latitude: number | null
          locality: string | null
          longitude: number | null
          postal_code: string | null
          state_region: string | null
          timezone: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          business_id: string
          city?: string | null
          country_code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_public?: boolean
          latitude?: number | null
          locality?: string | null
          longitude?: number | null
          postal_code?: string | null
          state_region?: string | null
          timezone?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          business_id?: string
          city?: string | null
          country_code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_public?: boolean
          latitude?: number | null
          locality?: string | null
          longitude?: number | null
          postal_code?: string | null
          state_region?: string | null
          timezone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_locations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_profiles: {
        Row: {
          biography: string | null
          business_id: string
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          credential_verification_status: string
          provider_type: string
          published_status: string
          updated_at: string
        }
        Insert: {
          biography?: string | null
          business_id: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          credential_verification_status?: string
          provider_type?: string
          published_status?: string
          updated_at?: string
        }
        Update: {
          biography?: string | null
          business_id?: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          credential_verification_status?: string
          provider_type?: string
          published_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_profiles_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          booking_id: string | null
          created_at: string
          id: string
          listing_id: string
          moderation_status: string
          order_item_id: string | null
          profile_id: string
          rating: number
          review_text: string | null
          updated_at: string
          verified_purchase: boolean
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          id?: string
          listing_id: string
          moderation_status?: string
          order_item_id?: string | null
          profile_id: string
          rating: number
          review_text?: string | null
          updated_at?: string
          verified_purchase?: boolean
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          id?: string
          listing_id?: string
          moderation_status?: string
          order_item_id?: string | null
          profile_id?: string
          rating?: number
          review_text?: string | null
          updated_at?: string
          verified_purchase?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_payment_accounts: {
        Row: {
          business_id: string
          created_at: string
          id: string
          live_payments_enabled: boolean
          onboarding_status: string
          payment_provider: string
          provider_account_reference: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          live_payments_enabled?: boolean
          onboarding_status?: string
          payment_provider: string
          provider_account_reference?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          live_payments_enabled?: boolean
          onboarding_status?: string
          payment_provider?: string
          provider_account_reference?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_payment_accounts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      service_availability_exceptions: {
        Row: {
          created_at: string
          ends_at: string
          id: string
          is_unavailable: boolean
          reason: string | null
          service_listing_id: string
          starts_at: string
        }
        Insert: {
          created_at?: string
          ends_at: string
          id?: string
          is_unavailable?: boolean
          reason?: string | null
          service_listing_id: string
          starts_at: string
        }
        Update: {
          created_at?: string
          ends_at?: string
          id?: string
          is_unavailable?: boolean
          reason?: string | null
          service_listing_id?: string
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_availability_exceptions_service_listing_id_fkey"
            columns: ["service_listing_id"]
            isOneToOne: false
            referencedRelation: "service_offerings"
            referencedColumns: ["listing_id"]
          },
        ]
      }
      service_availability_rules: {
        Row: {
          active_status: boolean
          effective_from: string | null
          effective_to: string | null
          end_local_time: string
          id: string
          service_listing_id: string
          start_local_time: string
          timezone: string
          weekday: number
        }
        Insert: {
          active_status?: boolean
          effective_from?: string | null
          effective_to?: string | null
          end_local_time: string
          id?: string
          service_listing_id: string
          start_local_time: string
          timezone: string
          weekday: number
        }
        Update: {
          active_status?: boolean
          effective_from?: string | null
          effective_to?: string | null
          end_local_time?: string
          id?: string
          service_listing_id?: string
          start_local_time?: string
          timezone?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "service_availability_rules_service_listing_id_fkey"
            columns: ["service_listing_id"]
            isOneToOne: false
            referencedRelation: "service_offerings"
            referencedColumns: ["listing_id"]
          },
        ]
      }
      service_offerings: {
        Row: {
          appointment_required: boolean
          cancellation_policy: string | null
          created_at: string
          delivery_mode: string
          duration_minutes: number | null
          listing_id: string
          provider_location_id: string | null
          updated_at: string
        }
        Insert: {
          appointment_required?: boolean
          cancellation_policy?: string | null
          created_at?: string
          delivery_mode?: string
          duration_minutes?: number | null
          listing_id: string
          provider_location_id?: string | null
          updated_at?: string
        }
        Update: {
          appointment_required?: boolean
          cancellation_policy?: string | null
          created_at?: string
          delivery_mode?: string
          duration_minutes?: number | null
          listing_id?: string
          provider_location_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_offerings_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_offerings_provider_location_id_fkey"
            columns: ["provider_location_id"]
            isOneToOne: false
            referencedRelation: "provider_locations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
