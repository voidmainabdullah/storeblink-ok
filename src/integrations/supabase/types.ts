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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      customers: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          store_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          store_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          store_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      items: {
        Row: {
          badge: string | null
          category: string | null
          created_at: string
          description: string | null
          free_delivery: boolean
          handle: string | null
          id: string
          image_url: string | null
          images: Json
          is_published: boolean
          name: string
          original_price_cents: number | null
          price_cents: number
          sale_ends_at: string | null
          sale_tag: string | null
          sold_count: number
          stock: number | null
          store_id: string | null
          deleted_at: string | null
          user_id: string
          visible_categories: string[]
        }
        Insert: {
          badge?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          free_delivery?: boolean
          handle?: string | null
          id?: string
          image_url?: string | null
          images?: Json
          is_published?: boolean
          name: string
          original_price_cents?: number | null
          price_cents?: number
          sale_ends_at?: string | null
          sale_tag?: string | null
          sold_count?: number
          stock?: number | null
          store_id?: string | null
          deleted_at?: string | null
          user_id: string
          visible_categories?: string[]
        }
        Update: {
          badge?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          free_delivery?: boolean
          handle?: string | null
          id?: string
          image_url?: string | null
          images?: Json
          is_published?: boolean
          name?: string
          original_price_cents?: number | null
          price_cents?: number
          sale_ends_at?: string | null
          sale_tag?: string | null
          sold_count?: number
          stock?: number | null
          store_id?: string | null
          deleted_at?: string | null
          user_id?: string
          visible_categories?: string[]
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          image_url: string | null
          is_read: boolean
          kind: string
          link_url: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_read?: boolean
          kind?: string
          link_url?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_read?: boolean
          kind?: string
          link_url?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          item_id: string | null
          item_name: string
          order_id: string
          quantity: number
          store_id: string | null
          unit_price_cents: number
        }
        Insert: {
          created_at?: string
          id?: string
          item_id?: string | null
          item_name: string
          order_id: string
          quantity?: number
          store_id?: string | null
          unit_price_cents: number
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string | null
          item_name?: string
          order_id?: string
          quantity?: number
          store_id?: string | null
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          checkout_idempotency_key: string | null
          created_at: string
          customer_email: string | null
          customer_name: string
          customer_phone: string | null
          id: string
          note: string | null
          order_number: string
          payment_method: string
          payment_status: string
          shipping_address: Json
          status: string
          store_id: string | null
          store_user_id: string
          total_cents: number
        }
        Insert: {
          checkout_idempotency_key?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name: string
          customer_phone?: string | null
          id?: string
          note?: string | null
          order_number: string
          payment_method?: string
          payment_status?: string
          shipping_address?: Json
          status?: string
          store_id?: string | null
          store_user_id: string
          total_cents?: number
        }
        Update: {
          checkout_idempotency_key?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string | null
          id?: string
          note?: string | null
          order_number?: string
          payment_method?: string
          payment_status?: string
          shipping_address?: Json
          status?: string
          store_id?: string | null
          store_user_id?: string
          total_cents?: number
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount_cents: number
          created_at: string
          customer_name: string | null
          id: string
          method: string | null
          note: string | null
          status: string
          store_id: string | null
          user_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          customer_name?: string | null
          id?: string
          method?: string | null
          note?: string | null
          status?: string
          store_id?: string | null
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          customer_name?: string | null
          id?: string
          method?: string | null
          note?: string | null
          status?: string
          store_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          banners: Json
          business_name: string | null
          business_type: string | null
          categories: Json
          created_at: string
          full_name: string | null
          id: string
          name_change_count: number
          onboarding_completed: boolean
          special_sections: Json
          store_about: string | null
          store_banner_url: string | null
          store_color: string | null
          store_slug: string | null
          store_tagline: string | null
          store_template: string
          theme: Json
          theme_draft: Json | null
          theme_published: Json | null
          theme_revision: number
          published_at: string | null
          updated_at: string
        }
        Insert: {
          banners?: Json
          business_name?: string | null
          business_type?: string | null
          categories?: Json
          created_at?: string
          full_name?: string | null
          id: string
          name_change_count?: number
          onboarding_completed?: boolean
          special_sections?: Json
          store_about?: string | null
          store_banner_url?: string | null
          store_color?: string | null
          store_slug?: string | null
          store_tagline?: string | null
          store_template?: string
          theme?: Json
          theme_draft?: Json | null
          theme_published?: Json | null
          theme_revision?: number
          published_at?: string | null
          updated_at?: string
        }
        Update: {
          banners?: Json
          business_name?: string | null
          business_type?: string | null
          categories?: Json
          created_at?: string
          full_name?: string | null
          id?: string
          name_change_count?: number
          onboarding_completed?: boolean
          special_sections?: Json
          store_about?: string | null
          store_banner_url?: string | null
          store_color?: string | null
          store_slug?: string | null
          store_tagline?: string | null
          store_template?: string
          theme?: Json
          theme_draft?: Json | null
          theme_published?: Json | null
          theme_revision?: number
          published_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      complete_store_onboarding: {
        Args: {
          p_business_name: string
          p_business_type: string
          p_categories: Json
          p_requested_handle: string
          p_store_color: string
          p_store_template: string
          p_theme: Json
        }
        Returns: Json
      }
      get_dashboard_bootstrap: {
        Args: { p_store_id?: string }
        Returns: Json
      }
      get_public_catalog: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_query?: string
          p_sort?: string
          p_store_id: string
        }
        Returns: {
          badge: string | null
          category: string | null
          description: string | null
          free_delivery: boolean
          handle: string | null
          id: string
          image_url: string | null
          images: Json
          is_published: boolean
          name: string
          original_price_cents: number | null
          price_cents: number
          sale_ends_at: string | null
          sale_tag: string | null
          stock: number | null
          total_count: number
        }[]
      }
      get_public_product: {
        Args: {
          p_identifier: string
          p_store_id: string
        }
        Returns: Json
      }
      get_public_storefront: {
        Args: {
          p_handle: string
        }
        Returns: Json
      }
      place_storefront_cod_order: {
        Args: {
          p_customer: Json
          p_idempotency_key?: string
          p_lines: Json
          p_note?: string | null
          p_store_id: string
        }
        Returns: Json
      }
      get_storefront_publication: {
        Args: {
          p_publication_id: string
        }
        Returns: Json
      }
      get_storefront_publication_history: {
        Args: {
          p_limit?: number
        }
        Returns: Json
      }
      publish_storefront: {
        Args: {
          p_store_id?: string
          p_document: Json
          p_expected_revision: number
          p_store_color?: string | null
        }
        Returns: Json
      }
      reserve_inventory: {
        Args: {
          p_quantity: number
          p_store_id: string
          p_variant_id: string
        }
        Returns: boolean
      }
      save_storefront_draft: {
        Args: {
          p_store_id?: string
          p_document: Json
          p_expected_revision: number
          p_store_color?: string | null
        }
        Returns: Json
      }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
