export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  public: {
    Tables: {
      ai_agents: {
        Row: {
          active: boolean;
          call_instructions: Json;
          channels: string[];
          id: string;
          kind: string;
          model: string | null;
          organization_id: string;
          system_prompt: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          active?: boolean;
          call_instructions?: Json;
          channels?: string[];
          id?: string;
          kind: string;
          model?: string | null;
          organization_id: string;
          system_prompt?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          active?: boolean;
          call_instructions?: Json;
          channels?: string[];
          id?: string;
          kind?: string;
          model?: string | null;
          organization_id?: string;
          system_prompt?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ai_agents_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_chat_conversations: {
        Row: {
          created_at: string;
          id: string;
          profile_id: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          profile_id: string;
          title?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          profile_id?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_chat_conversations_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_chat_messages: {
        Row: {
          content: string;
          conversation_id: string;
          created_at: string;
          id: string;
          role: string;
        };
        Insert: {
          content: string;
          conversation_id: string;
          created_at?: string;
          id?: string;
          role: string;
        };
        Update: {
          content?: string;
          conversation_id?: string;
          created_at?: string;
          id?: string;
          role?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_chat_messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "ai_chat_conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      alert_states: {
        Row: {
          alert_key: string;
          created_at: string;
          dismissed_at: string | null;
          id: string;
          organization_id: string;
          read_at: string | null;
          user_id: string;
        };
        Insert: {
          alert_key: string;
          created_at?: string;
          dismissed_at?: string | null;
          id?: string;
          organization_id: string;
          read_at?: string | null;
          user_id: string;
        };
        Update: {
          alert_key?: string;
          created_at?: string;
          dismissed_at?: string | null;
          id?: string;
          organization_id?: string;
          read_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "alert_states_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "alert_states_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      amocrm_calls: {
        Row: {
          ai_note_created_at: string | null;
          ai_note_id: number | null;
          ai_summary: string | null;
          amocrm_lead_entity_id: number | null;
          amocrm_note_id: number | null;
          amocrm_task_id: number | null;
          analysis: Json | null;
          analyzed_at: string | null;
          connected: boolean;
          created_by: string | null;
          direction: string;
          duration_seconds: number;
          id: string;
          intake_answers: Json;
          lead_id: string | null;
          mood: string | null;
          next_step: string | null;
          occurred_at: string;
          organization_id: string;
          phone: string | null;
          recording_url: string | null;
          score: number | null;
          service_line_id: string | null;
          source: string;
          synced_at: string;
          talk_ratio: number | null;
          task_created_at: string | null;
          transcript: string | null;
        };
        Insert: {
          ai_note_created_at?: string | null;
          ai_note_id?: number | null;
          ai_summary?: string | null;
          amocrm_lead_entity_id?: number | null;
          amocrm_note_id?: number | null;
          amocrm_task_id?: number | null;
          analysis?: Json | null;
          analyzed_at?: string | null;
          connected?: boolean;
          created_by?: string | null;
          direction: string;
          duration_seconds?: number;
          id?: string;
          intake_answers?: Json;
          lead_id?: string | null;
          mood?: string | null;
          next_step?: string | null;
          occurred_at: string;
          organization_id: string;
          phone?: string | null;
          recording_url?: string | null;
          score?: number | null;
          service_line_id?: string | null;
          source?: string;
          synced_at?: string;
          talk_ratio?: number | null;
          task_created_at?: string | null;
          transcript?: string | null;
        };
        Update: {
          ai_note_created_at?: string | null;
          ai_note_id?: number | null;
          ai_summary?: string | null;
          amocrm_lead_entity_id?: number | null;
          amocrm_note_id?: number | null;
          amocrm_task_id?: number | null;
          analysis?: Json | null;
          analyzed_at?: string | null;
          connected?: boolean;
          created_by?: string | null;
          direction?: string;
          duration_seconds?: number;
          id?: string;
          intake_answers?: Json;
          lead_id?: string | null;
          mood?: string | null;
          next_step?: string | null;
          occurred_at?: string;
          organization_id?: string;
          phone?: string | null;
          recording_url?: string | null;
          score?: number | null;
          service_line_id?: string | null;
          source?: string;
          synced_at?: string;
          talk_ratio?: number | null;
          task_created_at?: string | null;
          transcript?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "amocrm_calls_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "amocrm_calls_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "amocrm_calls_service_line_id_fkey";
            columns: ["service_line_id"];
            isOneToOne: false;
            referencedRelation: "service_lines";
            referencedColumns: ["id"];
          },
        ];
      };
      amocrm_connection: {
        Row: {
          access_token: string;
          active_funnel_ignore_missing: boolean;
          active_funnel_last_check: Json | null;
          connected_at: string;
          connected_by: string | null;
          enabled_pipeline_ids: number[] | null;
          enabled_user_ids: number[] | null;
          initial_sync_page: number | null;
          last_sync_error: string | null;
          last_synced_at: string | null;
          organization_id: string;
          recording_trim_before_answer: boolean;
          refresh_token: string;
          subdomain: string;
          sync_in_progress: boolean;
          sync_started_at: string | null;
          token_expires_at: string;
        };
        Insert: {
          access_token: string;
          active_funnel_ignore_missing?: boolean;
          active_funnel_last_check?: Json | null;
          connected_at?: string;
          connected_by?: string | null;
          enabled_pipeline_ids?: number[] | null;
          enabled_user_ids?: number[] | null;
          initial_sync_page?: number | null;
          last_sync_error?: string | null;
          last_synced_at?: string | null;
          organization_id: string;
          recording_trim_before_answer?: boolean;
          refresh_token: string;
          subdomain: string;
          sync_in_progress?: boolean;
          sync_started_at?: string | null;
          token_expires_at: string;
        };
        Update: {
          access_token?: string;
          active_funnel_ignore_missing?: boolean;
          active_funnel_last_check?: Json | null;
          connected_at?: string;
          connected_by?: string | null;
          enabled_pipeline_ids?: number[] | null;
          enabled_user_ids?: number[] | null;
          initial_sync_page?: number | null;
          last_sync_error?: string | null;
          last_synced_at?: string | null;
          organization_id?: string;
          recording_trim_before_answer?: boolean;
          refresh_token?: string;
          subdomain?: string;
          sync_in_progress?: boolean;
          sync_started_at?: string | null;
          token_expires_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "amocrm_connection_connected_by_fkey";
            columns: ["connected_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "amocrm_connection_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          id: string;
          meta: Json;
          organization_id: string | null;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          id?: string;
          meta?: Json;
          organization_id?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string;
          id?: string;
          meta?: Json;
          organization_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_logs_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      auto_responders: {
        Row: {
          active: boolean;
          channels: string[];
          created_at: string;
          created_by: string | null;
          id: string;
          message: string;
          name: string;
          organization_id: string;
          target_field: string | null;
          trigger_text: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          channels?: string[];
          created_at?: string;
          created_by?: string | null;
          id?: string;
          message?: string;
          name: string;
          organization_id: string;
          target_field?: string | null;
          trigger_text?: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          channels?: string[];
          created_at?: string;
          created_by?: string | null;
          id?: string;
          message?: string;
          name?: string;
          organization_id?: string;
          target_field?: string | null;
          trigger_text?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "auto_responders_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      business_profile: {
        Row: {
          company_name: string;
          competitors: string;
          competitors_list: string[];
          description: string;
          glossary: Json;
          id: boolean;
          objections: Json;
          organization_id: string;
          products_services: Json;
          qualified_lead_definition: string;
          target_customer: string;
          terminology: string;
          tone: string;
          updated_at: string;
          updated_by: string | null;
          value_proposition: string;
        };
        Insert: {
          company_name?: string;
          competitors?: string;
          competitors_list?: string[];
          description?: string;
          glossary?: Json;
          id?: boolean;
          objections?: Json;
          organization_id: string;
          products_services?: Json;
          qualified_lead_definition?: string;
          target_customer?: string;
          terminology?: string;
          tone?: string;
          updated_at?: string;
          updated_by?: string | null;
          value_proposition?: string;
        };
        Update: {
          company_name?: string;
          competitors?: string;
          competitors_list?: string[];
          description?: string;
          glossary?: Json;
          id?: boolean;
          objections?: Json;
          organization_id?: string;
          products_services?: Json;
          qualified_lead_definition?: string;
          target_customer?: string;
          terminology?: string;
          tone?: string;
          updated_at?: string;
          updated_by?: string | null;
          value_proposition?: string;
        };
        Relationships: [
          {
            foreignKeyName: "business_profile_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "business_profile_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      call_categories: {
        Row: {
          conversation_domain: string | null;
          created_at: string;
          description: string;
          exclusion_reason: string | null;
          id: string;
          name: string;
          organization_id: string;
          position: number;
          scored: boolean;
          system_family: boolean;
          temporary: boolean;
          workflow_family: string | null;
        };
        Insert: {
          conversation_domain?: string | null;
          created_at?: string;
          description?: string;
          exclusion_reason?: string | null;
          id?: string;
          name: string;
          organization_id: string;
          position?: number;
          scored?: boolean;
          system_family?: boolean;
          temporary?: boolean;
          workflow_family?: string | null;
        };
        Update: {
          conversation_domain?: string | null;
          created_at?: string;
          description?: string;
          exclusion_reason?: string | null;
          id?: string;
          name?: string;
          organization_id?: string;
          position?: number;
          scored?: boolean;
          system_family?: boolean;
          temporary?: boolean;
          workflow_family?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "call_categories_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      call_skills: {
        Row: {
          color: string;
          created_at: string;
          id: string;
          name: string;
          organization_id: string;
          position: number;
        };
        Insert: {
          color?: string;
          created_at?: string;
          id?: string;
          name: string;
          organization_id: string;
          position?: number;
        };
        Update: {
          color?: string;
          created_at?: string;
          id?: string;
          name?: string;
          organization_id?: string;
          position?: number;
        };
        Relationships: [
          {
            foreignKeyName: "call_skills_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      call_stages: {
        Row: {
          category_id: string | null;
          created_at: string;
          id: string;
          name: string;
          organization_id: string;
          position: number;
          weight_percent: number;
        };
        Insert: {
          category_id?: string | null;
          created_at?: string;
          id?: string;
          name: string;
          organization_id: string;
          position?: number;
          weight_percent?: number;
        };
        Update: {
          category_id?: string | null;
          created_at?: string;
          id?: string;
          name?: string;
          organization_id?: string;
          position?: number;
          weight_percent?: number;
        };
        Relationships: [
          {
            foreignKeyName: "call_stages_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "call_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "call_stages_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      call_stage_steps: {
        Row: {
          code: string | null;
          created_at: string;
          description: string;
          id: string;
          level_0_desc: string;
          level_1_desc: string;
          level_2_desc: string;
          level_3_desc: string;
          name: string;
          organization_id: string;
          points: number;
          position: number;
          skill_id: string | null;
          stage_id: string;
        };
        Insert: {
          code?: string | null;
          created_at?: string;
          description?: string;
          id?: string;
          level_0_desc?: string;
          level_1_desc?: string;
          level_2_desc?: string;
          level_3_desc?: string;
          name: string;
          organization_id: string;
          points?: number;
          position?: number;
          skill_id?: string | null;
          stage_id: string;
        };
        Update: {
          code?: string | null;
          created_at?: string;
          description?: string;
          id?: string;
          level_0_desc?: string;
          level_1_desc?: string;
          level_2_desc?: string;
          level_3_desc?: string;
          name?: string;
          organization_id?: string;
          points?: number;
          position?: number;
          skill_id?: string | null;
          stage_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "call_stage_steps_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "call_stage_steps_skill_id_fkey";
            columns: ["skill_id"];
            isOneToOne: false;
            referencedRelation: "call_skills";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "call_stage_steps_stage_id_fkey";
            columns: ["stage_id"];
            isOneToOne: false;
            referencedRelation: "call_stages";
            referencedColumns: ["id"];
          },
        ];
      };
      fine_types: {
        Row: {
          color: string;
          created_at: string;
          default_amount: number | null;
          description: string | null;
          id: string;
          name: string;
          organization_id: string;
          position: number;
          target_positions: string[] | null;
        };
        Insert: {
          color?: string;
          created_at?: string;
          default_amount?: number | null;
          description?: string | null;
          id?: string;
          name: string;
          organization_id: string;
          position?: number;
          target_positions?: string[] | null;
        };
        Update: {
          color?: string;
          created_at?: string;
          default_amount?: number | null;
          description?: string | null;
          id?: string;
          name?: string;
          organization_id?: string;
          position?: number;
          target_positions?: string[] | null;
        };
        Relationships: [
          {
            foreignKeyName: "fine_types_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      fines: {
        Row: {
          amocrm_call_id: string | null;
          amount: number;
          created_at: string;
          created_by: string | null;
          fine_type_id: string;
          id: string;
          occurred_on: string;
          organization_id: string;
          profile_id: string;
          reason: string | null;
          source: string;
        };
        Insert: {
          amocrm_call_id?: string | null;
          amount?: number;
          created_at?: string;
          created_by?: string | null;
          fine_type_id: string;
          id?: string;
          occurred_on?: string;
          organization_id: string;
          profile_id: string;
          reason?: string | null;
          source?: string;
        };
        Update: {
          amocrm_call_id?: string | null;
          amount?: number;
          created_at?: string;
          created_by?: string | null;
          fine_type_id?: string;
          id?: string;
          occurred_on?: string;
          organization_id?: string;
          profile_id?: string;
          reason?: string | null;
          source?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fines_amocrm_call_id_fkey";
            columns: ["amocrm_call_id"];
            isOneToOne: false;
            referencedRelation: "amocrm_calls";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fines_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fines_fine_type_id_fkey";
            columns: ["fine_type_id"];
            isOneToOne: false;
            referencedRelation: "fine_types";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fines_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fines_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      service_lines: {
        Row: {
          aliases: string[];
          created_at: string;
          description: string;
          id: string;
          name: string;
          organization_id: string;
          position: number;
          sample_phrases: string[];
        };
        Insert: {
          aliases?: string[];
          created_at?: string;
          description?: string;
          id?: string;
          name: string;
          organization_id: string;
          position?: number;
          sample_phrases?: string[];
        };
        Update: {
          aliases?: string[];
          created_at?: string;
          description?: string;
          id?: string;
          name?: string;
          organization_id?: string;
          position?: number;
          sample_phrases?: string[];
        };
        Relationships: [
          {
            foreignKeyName: "service_lines_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      intake_questions: {
        Row: {
          created_at: string;
          id: string;
          label: string;
          organization_id: string;
          position: number;
          service_line_id: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          label: string;
          organization_id: string;
          position?: number;
          service_line_id?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          label?: string;
          organization_id?: string;
          position?: number;
          service_line_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "intake_questions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "intake_questions_service_line_id_fkey";
            columns: ["service_line_id"];
            isOneToOne: false;
            referencedRelation: "service_lines";
            referencedColumns: ["id"];
          },
        ];
      };
      lead_quality_stages: {
        Row: {
          conditions: string[];
          created_at: string;
          id: string;
          organization_id: string;
          position: number;
          qualified: boolean;
          system_locked: boolean;
          title: string;
        };
        Insert: {
          conditions?: string[];
          created_at?: string;
          id?: string;
          organization_id: string;
          position?: number;
          qualified?: boolean;
          system_locked?: boolean;
          title: string;
        };
        Update: {
          conditions?: string[];
          created_at?: string;
          id?: string;
          organization_id?: string;
          position?: number;
          qualified?: boolean;
          system_locked?: boolean;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lead_quality_stages_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      marketing_spend: {
        Row: {
          id: string;
          organization_id: string;
          source: string;
          campaign: string;
          month: string;
          amount: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          source: string;
          campaign?: string;
          month: string;
          amount?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          source?: string;
          campaign?: string;
          month?: string;
          amount?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "marketing_spend_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "marketing_spend_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      daily_report_settings: {
        Row: {
          call_audio_mini_app_enabled: boolean;
          created_at: string;
          crm_activity_enabled: boolean;
          google_sheets_url: string | null;
          id: string;
          intake_question_ids: string[] | null;
          intake_questions_enabled: boolean;
          call_quality_enabled: boolean;
          lead_quality_enabled: boolean;
          lead_quality_stage_ids: string[] | null;
          leads_movement_enabled: boolean;
          leads_movement_funnels: string[] | null;
          managers_activity_enabled: boolean;
          managers_activity_manager_ids: string[] | null;
          manager_conversion_recommendation_criterion_ids: string[] | null;
          manager_conversion_recommendations_enabled: boolean;
          morning_summary_enabled: boolean;
          organization_id: string;
          recommendations_enabled: boolean;
          report_language: string;
          report_sample_override: string | null;
          send_enabled: boolean;
          send_time: string;
          service_lines_enabled: boolean;
          summary_enabled: boolean;
          task_due_reminder_enabled: boolean;
          task_due_reminder_minutes_before: number;
          tasks_plan_enabled: boolean;
          updated_at: string;
        };
        Insert: {
          call_audio_mini_app_enabled?: boolean;
          created_at?: string;
          crm_activity_enabled?: boolean;
          google_sheets_url?: string | null;
          id?: string;
          intake_question_ids?: string[] | null;
          intake_questions_enabled?: boolean;
          call_quality_enabled?: boolean;
          lead_quality_enabled?: boolean;
          lead_quality_stage_ids?: string[] | null;
          leads_movement_enabled?: boolean;
          leads_movement_funnels?: string[] | null;
          managers_activity_enabled?: boolean;
          managers_activity_manager_ids?: string[] | null;
          manager_conversion_recommendation_criterion_ids?: string[] | null;
          manager_conversion_recommendations_enabled?: boolean;
          morning_summary_enabled?: boolean;
          organization_id: string;
          recommendations_enabled?: boolean;
          report_language?: string;
          report_sample_override?: string | null;
          send_enabled?: boolean;
          send_time?: string;
          service_lines_enabled?: boolean;
          summary_enabled?: boolean;
          task_due_reminder_enabled?: boolean;
          task_due_reminder_minutes_before?: number;
          tasks_plan_enabled?: boolean;
          updated_at?: string;
        };
        Update: {
          call_audio_mini_app_enabled?: boolean;
          created_at?: string;
          crm_activity_enabled?: boolean;
          google_sheets_url?: string | null;
          id?: string;
          intake_question_ids?: string[] | null;
          intake_questions_enabled?: boolean;
          call_quality_enabled?: boolean;
          lead_quality_enabled?: boolean;
          lead_quality_stage_ids?: string[] | null;
          leads_movement_enabled?: boolean;
          leads_movement_funnels?: string[] | null;
          managers_activity_enabled?: boolean;
          managers_activity_manager_ids?: string[] | null;
          manager_conversion_recommendation_criterion_ids?: string[] | null;
          manager_conversion_recommendations_enabled?: boolean;
          morning_summary_enabled?: boolean;
          organization_id?: string;
          recommendations_enabled?: boolean;
          report_language?: string;
          report_sample_override?: string | null;
          send_enabled?: boolean;
          send_time?: string;
          service_lines_enabled?: boolean;
          summary_enabled?: boolean;
          task_due_reminder_enabled?: boolean;
          task_due_reminder_minutes_before?: number;
          tasks_plan_enabled?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "daily_report_settings_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      daily_report_history: {
        Row: {
          created_at: string;
          id: string;
          organization_id: string;
          report_date: string;
          report_text: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          organization_id: string;
          report_date: string;
          report_text: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          organization_id?: string;
          report_date?: string;
          report_text?: string;
        };
        Relationships: [
          {
            foreignKeyName: "daily_report_history_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      daily_report_stage_transition_rules: {
        Row: {
          created_at: string;
          from_stage_id: string | null;
          funnel: string;
          id: string;
          manager_id: string | null;
          manager_scope: string;
          organization_id: string;
          position: number;
          to_stage_id: string;
        };
        Insert: {
          created_at?: string;
          from_stage_id?: string | null;
          funnel: string;
          id?: string;
          manager_id?: string | null;
          manager_scope?: string;
          organization_id: string;
          position?: number;
          to_stage_id: string;
        };
        Update: {
          created_at?: string;
          from_stage_id?: string | null;
          funnel?: string;
          id?: string;
          manager_id?: string | null;
          manager_scope?: string;
          organization_id?: string;
          position?: number;
          to_stage_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "daily_report_stage_transition_rules_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "daily_report_stage_transition_rules_manager_id_fkey";
            columns: ["manager_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "daily_report_stage_transition_rules_from_stage_id_fkey";
            columns: ["from_stage_id"];
            isOneToOne: false;
            referencedRelation: "pipeline_stages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "daily_report_stage_transition_rules_to_stage_id_fkey";
            columns: ["to_stage_id"];
            isOneToOne: false;
            referencedRelation: "pipeline_stages";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_admin_credentials: {
        Row: {
          organization_id: string;
          super_admin_user_id: string;
          super_admin_email: string;
          super_admin_password_plaintext: string;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          super_admin_user_id: string;
          super_admin_email: string;
          super_admin_password_plaintext: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          super_admin_user_id?: string;
          super_admin_email?: string;
          super_admin_password_plaintext?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_admin_credentials_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      daily_report_mini_app_audio_rules: {
        Row: {
          created_at: string;
          funnel: string;
          id: string;
          organization_id: string;
          position: number;
          stage_ids: string[];
        };
        Insert: {
          created_at?: string;
          funnel: string;
          id?: string;
          organization_id: string;
          position?: number;
          stage_ids?: string[];
        };
        Update: {
          created_at?: string;
          funnel?: string;
          id?: string;
          organization_id?: string;
          position?: number;
          stage_ids?: string[];
        };
        Relationships: [
          {
            foreignKeyName: "daily_report_mini_app_audio_rules_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      call_qualification_groups: {
        Row: {
          created_at: string;
          funnel: string | null;
          id: string;
          name: string;
          organization_id: string;
          position: number;
        };
        Insert: {
          created_at?: string;
          funnel?: string | null;
          id?: string;
          name: string;
          organization_id: string;
          position?: number;
        };
        Update: {
          created_at?: string;
          funnel?: string | null;
          id?: string;
          name?: string;
          organization_id?: string;
          position?: number;
        };
        Relationships: [
          {
            foreignKeyName: "call_qualification_groups_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      call_qualification_criteria: {
        Row: {
          created_at: string;
          group_id: string;
          id: string;
          label: string;
          organization_id: string;
          position: number;
          weight: number;
        };
        Insert: {
          created_at?: string;
          group_id: string;
          id?: string;
          label: string;
          organization_id: string;
          position?: number;
          weight?: number;
        };
        Update: {
          created_at?: string;
          group_id?: string;
          id?: string;
          label?: string;
          organization_id?: string;
          position?: number;
          weight?: number;
        };
        Relationships: [
          {
            foreignKeyName: "call_qualification_criteria_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "call_qualification_groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "call_qualification_criteria_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      lessons: {
        Row: {
          category: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          duration_seconds: number | null;
          id: string;
          organization_id: string;
          position: number;
          section_id: string | null;
          thumbnail_url: string | null;
          title: string;
          updated_at: string;
          video_url: string;
        };
        Insert: {
          category?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          duration_seconds?: number | null;
          id?: string;
          organization_id: string;
          position?: number;
          section_id?: string | null;
          thumbnail_url?: string | null;
          title: string;
          updated_at?: string;
          video_url: string;
        };
        Update: {
          category?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          duration_seconds?: number | null;
          id?: string;
          organization_id?: string;
          position?: number;
          section_id?: string | null;
          thumbnail_url?: string | null;
          title?: string;
          updated_at?: string;
          video_url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lessons_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lessons_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lessons_section_id_fkey";
            columns: ["section_id"];
            isOneToOne: false;
            referencedRelation: "lesson_sections";
            referencedColumns: ["id"];
          },
        ];
      };
      lesson_sections: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          organization_id: string;
          position: number;
          title: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          organization_id: string;
          position?: number;
          title: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          organization_id?: string;
          position?: number;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lesson_sections_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lesson_sections_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      lesson_progress: {
        Row: {
          completed: boolean;
          completed_at: string | null;
          created_at: string;
          id: string;
          last_position_seconds: number;
          last_watched_at: string;
          lesson_id: string;
          organization_id: string;
          user_id: string;
        };
        Insert: {
          completed?: boolean;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          last_position_seconds?: number;
          last_watched_at?: string;
          lesson_id: string;
          organization_id: string;
          user_id: string;
        };
        Update: {
          completed?: boolean;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          last_position_seconds?: number;
          last_watched_at?: string;
          lesson_id?: string;
          organization_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lesson_progress_lesson_id_fkey";
            columns: ["lesson_id"];
            isOneToOne: false;
            referencedRelation: "lessons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lesson_progress_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lesson_progress_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      training_recommendations: {
        Row: {
          call_id: string | null;
          created_at: string;
          description: string;
          error_category: string;
          id: string;
          lead_id: string | null;
          manager_id: string;
          organization_id: string;
          recommended_lesson_id: string | null;
          status: string;
          title: string;
        };
        Insert: {
          call_id?: string | null;
          created_at?: string;
          description: string;
          error_category: string;
          id?: string;
          lead_id?: string | null;
          manager_id: string;
          organization_id: string;
          recommended_lesson_id?: string | null;
          status?: string;
          title: string;
        };
        Update: {
          call_id?: string | null;
          created_at?: string;
          description?: string;
          error_category?: string;
          id?: string;
          lead_id?: string | null;
          manager_id?: string;
          organization_id?: string;
          recommended_lesson_id?: string | null;
          status?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "training_recommendations_call_id_fkey";
            columns: ["call_id"];
            isOneToOne: false;
            referencedRelation: "amocrm_calls";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "training_recommendations_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "training_recommendations_manager_id_fkey";
            columns: ["manager_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "training_recommendations_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "training_recommendations_recommended_lesson_id_fkey";
            columns: ["recommended_lesson_id"];
            isOneToOne: false;
            referencedRelation: "lessons";
            referencedColumns: ["id"];
          },
        ];
      };
      call_logs: {
        Row: {
          connected: boolean;
          contact_id: string | null;
          created_at: string;
          duration_seconds: number;
          id: string;
          lead_id: string | null;
          organization_id: string | null;
          phone: string | null;
          profile_id: string;
        };
        Insert: {
          connected?: boolean;
          contact_id?: string | null;
          created_at?: string;
          duration_seconds?: number;
          id?: string;
          lead_id?: string | null;
          organization_id?: string | null;
          phone?: string | null;
          profile_id: string;
        };
        Update: {
          connected?: boolean;
          contact_id?: string | null;
          created_at?: string;
          duration_seconds?: number;
          id?: string;
          lead_id?: string | null;
          organization_id?: string | null;
          phone?: string | null;
          profile_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "call_logs_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "call_logs_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "call_logs_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "call_logs_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      companies: {
        Row: {
          amocrm_id: number | null;
          annual_revenue: number | null;
          city: string | null;
          country: string | null;
          created_at: string;
          employees_range: string | null;
          id: string;
          industry: string | null;
          name: string;
          organization_id: string;
          owner_id: string | null;
          updated_at: string;
          website: string | null;
        };
        Insert: {
          amocrm_id?: number | null;
          annual_revenue?: number | null;
          city?: string | null;
          country?: string | null;
          created_at?: string;
          employees_range?: string | null;
          id?: string;
          industry?: string | null;
          name: string;
          organization_id: string;
          owner_id?: string | null;
          updated_at?: string;
          website?: string | null;
        };
        Update: {
          amocrm_id?: number | null;
          annual_revenue?: number | null;
          city?: string | null;
          country?: string | null;
          created_at?: string;
          employees_range?: string | null;
          id?: string;
          industry?: string | null;
          name?: string;
          organization_id?: string;
          owner_id?: string | null;
          updated_at?: string;
          website?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "companies_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "companies_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      content_library_items: {
        Row: {
          color: string | null;
          created_at: string;
          created_by: string | null;
          description: string;
          file_path: string | null;
          id: string;
          item_type: string;
          organization_id: string;
          section: string;
          title: string;
          updated_at: string;
          url: string | null;
        };
        Insert: {
          color?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string;
          file_path?: string | null;
          id?: string;
          item_type: string;
          organization_id: string;
          section: string;
          title: string;
          updated_at?: string;
          url?: string | null;
        };
        Update: {
          color?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string;
          file_path?: string | null;
          id?: string;
          item_type?: string;
          organization_id?: string;
          section?: string;
          title?: string;
          updated_at?: string;
          url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "content_library_items_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_library_items_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      content_library_settings: {
        Row: {
          about_google_sheets_url: string | null;
          organization_id: string;
          training_google_sheets_url: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          about_google_sheets_url?: string | null;
          organization_id: string;
          training_google_sheets_url?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          about_google_sheets_url?: string | null;
          organization_id?: string;
          training_google_sheets_url?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "content_library_settings_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_library_settings_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      contacts: {
        Row: {
          alt_phone: string | null;
          amocrm_id: number | null;
          birthday: string | null;
          company_id: string | null;
          created_at: string;
          email: string | null;
          full_name: string;
          id: string;
          organization_id: string;
          owner_id: string | null;
          phone: string | null;
          position: string | null;
          telegram: string | null;
          updated_at: string;
          whatsapp: string | null;
        };
        Insert: {
          alt_phone?: string | null;
          amocrm_id?: number | null;
          birthday?: string | null;
          company_id?: string | null;
          created_at?: string;
          email?: string | null;
          full_name: string;
          id?: string;
          organization_id: string;
          owner_id?: string | null;
          phone?: string | null;
          position?: string | null;
          telegram?: string | null;
          updated_at?: string;
          whatsapp?: string | null;
        };
        Update: {
          alt_phone?: string | null;
          amocrm_id?: number | null;
          birthday?: string | null;
          company_id?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string;
          id?: string;
          organization_id?: string;
          owner_id?: string | null;
          phone?: string | null;
          position?: string | null;
          telegram?: string | null;
          updated_at?: string;
          whatsapp?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contacts_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contacts_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      deals: {
        Row: {
          close_date: string | null;
          company_id: string | null;
          contact_id: string | null;
          created_at: string;
          currency: string;
          discount: number;
          id: string;
          lead_id: string | null;
          name: string;
          organization_id: string;
          owner_id: string | null;
          pipeline: string | null;
          probability: number;
          products_count: number;
          stage_id: string | null;
          status: Database["public"]["Enums"]["deal_status"];
          tax: number;
          updated_at: string;
          value: number;
        };
        Insert: {
          close_date?: string | null;
          company_id?: string | null;
          contact_id?: string | null;
          created_at?: string;
          currency?: string;
          discount?: number;
          id?: string;
          lead_id?: string | null;
          name: string;
          organization_id: string;
          owner_id?: string | null;
          pipeline?: string | null;
          probability?: number;
          products_count?: number;
          stage_id?: string | null;
          status?: Database["public"]["Enums"]["deal_status"];
          tax?: number;
          updated_at?: string;
          value?: number;
        };
        Update: {
          close_date?: string | null;
          company_id?: string | null;
          contact_id?: string | null;
          created_at?: string;
          currency?: string;
          discount?: number;
          id?: string;
          lead_id?: string | null;
          name?: string;
          organization_id?: string;
          owner_id?: string | null;
          pipeline?: string | null;
          probability?: number;
          products_count?: number;
          stage_id?: string | null;
          status?: Database["public"]["Enums"]["deal_status"];
          tax?: number;
          updated_at?: string;
          value?: number;
        };
        Relationships: [
          {
            foreignKeyName: "deals_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deals_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deals_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deals_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deals_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deals_stage_id_fkey";
            columns: ["stage_id"];
            isOneToOne: false;
            referencedRelation: "pipeline_stages";
            referencedColumns: ["id"];
          },
        ];
      };
      error_logs: {
        Row: {
          context: Json;
          created_at: string;
          id: string;
          message: string;
          organization_id: string | null;
          resolved: boolean;
          route: string | null;
          source: string;
          stack: string | null;
          user_id: string | null;
        };
        Insert: {
          context?: Json;
          created_at?: string;
          id?: string;
          message: string;
          organization_id?: string | null;
          resolved?: boolean;
          route?: string | null;
          source?: string;
          stack?: string | null;
          user_id?: string | null;
        };
        Update: {
          context?: Json;
          created_at?: string;
          id?: string;
          message?: string;
          organization_id?: string | null;
          resolved?: boolean;
          route?: string | null;
          source?: string;
          stack?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "error_logs_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "error_logs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      feedback_reports: {
        Row: {
          created_at: string;
          id: string;
          message: string;
          organization_id: string;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          message: string;
          organization_id: string;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          message?: string;
          organization_id?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "feedback_reports_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "feedback_reports_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      integration_settings: {
        Row: {
          config: Json;
          enabled: boolean;
          id: string;
          key: string;
          organization_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          config?: Json;
          enabled?: boolean;
          id?: string;
          key: string;
          organization_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          config?: Json;
          enabled?: boolean;
          id?: string;
          key?: string;
          organization_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "integration_settings_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "integration_settings_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      lead_activities: {
        Row: {
          content: string;
          created_at: string;
          created_by: string | null;
          id: string;
          lead_id: string;
          organization_id: string | null;
          type: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          lead_id: string;
          organization_id?: string | null;
          type: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          lead_id?: string;
          organization_id?: string | null;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lead_activities_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lead_activities_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lead_activities_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      leads: {
        Row: {
          address: string | null;
          ai_customer_profile: Json | null;
          amocrm_id: number | null;
          budget: number;
          campaign: string | null;
          city: string | null;
          company_id: string | null;
          company_name: string;
          contact_id: string | null;
          country: string | null;
          created_at: string;
          expected_revenue: number;
          funnel: string | null;
          id: string;
          last_contact_at: string | null;
          lead_quality_stage_id: string | null;
          loss_reason: string | null;
          manager_id: string | null;
          name: string;
          next_follow_up: string | null;
          organization_id: string;
          owner_id: string | null;
          priority: Database["public"]["Enums"]["priority_level"];
          recoverable: boolean | null;
          recoverable_reason: string | null;
          region: string | null;
          score: number;
          source: string | null;
          stage_id: string | null;
          tags: string[];
          temperature: Database["public"]["Enums"]["lead_temperature"];
          updated_at: string;
          utm: string | null;
        };
        Insert: {
          address?: string | null;
          ai_customer_profile?: Json | null;
          amocrm_id?: number | null;
          budget?: number;
          campaign?: string | null;
          city?: string | null;
          company_id?: string | null;
          company_name?: string;
          contact_id?: string | null;
          country?: string | null;
          created_at?: string;
          expected_revenue?: number;
          funnel?: string | null;
          id?: string;
          last_contact_at?: string | null;
          lead_quality_stage_id?: string | null;
          loss_reason?: string | null;
          manager_id?: string | null;
          name: string;
          next_follow_up?: string | null;
          organization_id: string;
          owner_id?: string | null;
          priority?: Database["public"]["Enums"]["priority_level"];
          recoverable?: boolean | null;
          recoverable_reason?: string | null;
          region?: string | null;
          score?: number;
          source?: string | null;
          stage_id?: string | null;
          tags?: string[];
          temperature?: Database["public"]["Enums"]["lead_temperature"];
          updated_at?: string;
          utm?: string | null;
        };
        Update: {
          address?: string | null;
          ai_customer_profile?: Json | null;
          amocrm_id?: number | null;
          budget?: number;
          campaign?: string | null;
          city?: string | null;
          company_id?: string | null;
          company_name?: string;
          contact_id?: string | null;
          country?: string | null;
          created_at?: string;
          expected_revenue?: number;
          funnel?: string | null;
          id?: string;
          last_contact_at?: string | null;
          lead_quality_stage_id?: string | null;
          loss_reason?: string | null;
          manager_id?: string | null;
          name?: string;
          next_follow_up?: string | null;
          organization_id?: string;
          owner_id?: string | null;
          priority?: Database["public"]["Enums"]["priority_level"];
          recoverable?: boolean | null;
          recoverable_reason?: string | null;
          region?: string | null;
          score?: number;
          source?: string | null;
          stage_id?: string | null;
          tags?: string[];
          temperature?: Database["public"]["Enums"]["lead_temperature"];
          updated_at?: string;
          utm?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "leads_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_manager_id_fkey";
            columns: ["manager_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_lead_quality_stage_id_fkey";
            columns: ["lead_quality_stage_id"];
            isOneToOne: false;
            referencedRelation: "lead_quality_stages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_stage_id_fkey";
            columns: ["stage_id"];
            isOneToOne: false;
            referencedRelation: "pipeline_stages";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_preferences: {
        Row: {
          profile_id: string;
          task_assigned: boolean;
          updated_at: string;
        };
        Insert: {
          profile_id: string;
          task_assigned?: boolean;
          updated_at?: string;
        };
        Update: {
          profile_id?: string;
          task_assigned?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notification_preferences_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          body: string | null;
          created_at: string;
          id: string;
          link: string | null;
          organization_id: string | null;
          read: boolean;
          title: string;
          type: string;
          user_id: string | null;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          id?: string;
          link?: string | null;
          organization_id?: string | null;
          read?: boolean;
          title: string;
          type?: string;
          user_id?: string | null;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          id?: string;
          link?: string | null;
          organization_id?: string | null;
          read?: boolean;
          title?: string;
          type?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          active: boolean;
          created_at: string;
          created_by: string | null;
          id: string;
          name: string;
          phone: string | null;
          plan: string;
          trial_ends_at: string | null;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name: string;
          phone?: string | null;
          plan?: string;
          trial_ends_at?: string | null;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name?: string;
          phone?: string | null;
          plan?: string;
          trial_ends_at?: string | null;
        };
        Relationships: [];
      };
      org_structure_nodes: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          organization_id: string;
          parent_id: string | null;
          position: number;
          responsibilities: string;
          subtitle: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          organization_id?: string;
          parent_id?: string | null;
          position?: number;
          responsibilities?: string;
          subtitle?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          organization_id?: string;
          parent_id?: string | null;
          position?: number;
          responsibilities?: string;
          subtitle?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "org_structure_nodes_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "org_structure_nodes_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "org_structure_nodes_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "org_structure_nodes";
            referencedColumns: ["id"];
          },
        ];
      };
      platform_settings: {
        Row: {
          id: boolean;
          support_email: string | null;
          support_phone: string | null;
          support_telegram: string | null;
          updated_at: string;
        };
        Insert: {
          id?: boolean;
          support_email?: string | null;
          support_phone?: string | null;
          support_telegram?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: boolean;
          support_email?: string | null;
          support_phone?: string | null;
          support_telegram?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      subscription_requests: {
        Row: {
          created_at: string;
          id: string;
          note: string | null;
          organization_id: string;
          requested_by: string | null;
          resolved_at: string | null;
          status: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          note?: string | null;
          organization_id: string;
          requested_by?: string | null;
          resolved_at?: string | null;
          status?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          note?: string | null;
          organization_id?: string;
          requested_by?: string | null;
          resolved_at?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscription_requests_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subscription_requests_requested_by_fkey";
            columns: ["requested_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      amocrm_sync_log: {
        Row: {
          calls_synced: number | null;
          error: string | null;
          finished_at: string;
          id: string;
          organization_id: string;
          skipped: boolean;
          started_at: string;
          synced_count: number;
          tasks_synced: number | null;
          trigger: string;
        };
        Insert: {
          calls_synced?: number | null;
          error?: string | null;
          finished_at?: string;
          id?: string;
          organization_id: string;
          skipped?: boolean;
          started_at: string;
          synced_count?: number;
          tasks_synced?: number | null;
          trigger: string;
        };
        Update: {
          calls_synced?: number | null;
          error?: string | null;
          finished_at?: string;
          id?: string;
          organization_id?: string;
          skipped?: boolean;
          started_at?: string;
          synced_count?: number;
          tasks_synced?: number | null;
          trigger?: string;
        };
        Relationships: [
          {
            foreignKeyName: "amocrm_sync_log_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      amocrm_onboarding_checklist: {
        Row: {
          checked: Json;
          organization_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          checked?: Json;
          organization_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          checked?: Json;
          organization_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "amocrm_onboarding_checklist_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "amocrm_onboarding_checklist_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      org_ai_onboarding: {
        Row: {
          answers: Json;
          applied_at: string | null;
          applied_by: string | null;
          current_step: number;
          organization_id: string;
          proposal: Json | null;
          proposal_generated_at: string | null;
          source_crm: string | null;
          started_at: string | null;
          started_by: string | null;
          status: string;
          telegram_chat_id: number | null;
          updated_at: string;
        };
        Insert: {
          answers?: Json;
          applied_at?: string | null;
          applied_by?: string | null;
          current_step?: number;
          organization_id: string;
          proposal?: Json | null;
          proposal_generated_at?: string | null;
          source_crm?: string | null;
          started_at?: string | null;
          started_by?: string | null;
          status?: string;
          telegram_chat_id?: number | null;
          updated_at?: string;
        };
        Update: {
          answers?: Json;
          applied_at?: string | null;
          applied_by?: string | null;
          current_step?: number;
          organization_id?: string;
          proposal?: Json | null;
          proposal_generated_at?: string | null;
          source_crm?: string | null;
          started_at?: string | null;
          started_by?: string | null;
          status?: string;
          telegram_chat_id?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "org_ai_onboarding_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "org_ai_onboarding_started_by_fkey";
            columns: ["started_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "org_ai_onboarding_applied_by_fkey";
            columns: ["applied_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      org_data_imports: {
        Row: {
          column_mapping: Json | null;
          created_at: string;
          created_by: string | null;
          error: string | null;
          finished_at: string | null;
          id: string;
          imported_contacts: number;
          imported_deals: number;
          imported_leads: number;
          organization_id: string;
          row_count: number | null;
          source_label: string;
          status: string;
        };
        Insert: {
          column_mapping?: Json | null;
          created_at?: string;
          created_by?: string | null;
          error?: string | null;
          finished_at?: string | null;
          id?: string;
          imported_contacts?: number;
          imported_deals?: number;
          imported_leads?: number;
          organization_id: string;
          row_count?: number | null;
          source_label: string;
          status?: string;
        };
        Update: {
          column_mapping?: Json | null;
          created_at?: string;
          created_by?: string | null;
          error?: string | null;
          finished_at?: string | null;
          id?: string;
          imported_contacts?: number;
          imported_deals?: number;
          imported_leads?: number;
          organization_id?: string;
          row_count?: number | null;
          source_label?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "org_data_imports_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "org_data_imports_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      org_general_settings: {
        Row: {
          ai_task_creation_enabled: boolean;
          business_language: string | null;
          crm_task_forwarding_enabled: boolean;
          industry: string;
          organization_id: string;
          timezone: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          ai_task_creation_enabled?: boolean;
          business_language?: string | null;
          crm_task_forwarding_enabled?: boolean;
          industry?: string;
          organization_id: string;
          timezone?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          ai_task_creation_enabled?: boolean;
          business_language?: string | null;
          crm_task_forwarding_enabled?: boolean;
          industry?: string;
          organization_id?: string;
          timezone?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "org_general_settings_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      org_notification_settings: {
        Row: {
          call_analysis_bot: boolean;
          call_analysis_channel: boolean;
          call_analysis_group: boolean;
          call_analysis_web: boolean;
          daily_report_bot: boolean;
          daily_report_channel: boolean;
          daily_report_group: boolean;
          low_quality_alert_enabled: boolean;
          min_call_duration_minutes: number;
          organization_id: string;
          performance_bot: boolean;
          performance_channel: boolean;
          performance_group: boolean;
          performance_web: boolean;
          quality_threshold: number;
          technical_bot: boolean;
          technical_channel: boolean;
          technical_group: boolean;
          technical_web: boolean;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          call_analysis_bot?: boolean;
          call_analysis_channel?: boolean;
          call_analysis_group?: boolean;
          call_analysis_web?: boolean;
          daily_report_bot?: boolean;
          daily_report_channel?: boolean;
          daily_report_group?: boolean;
          low_quality_alert_enabled?: boolean;
          min_call_duration_minutes?: number;
          organization_id: string;
          performance_bot?: boolean;
          performance_channel?: boolean;
          performance_group?: boolean;
          performance_web?: boolean;
          quality_threshold?: number;
          technical_bot?: boolean;
          technical_channel?: boolean;
          technical_group?: boolean;
          technical_web?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          call_analysis_bot?: boolean;
          call_analysis_channel?: boolean;
          call_analysis_group?: boolean;
          call_analysis_web?: boolean;
          daily_report_bot?: boolean;
          daily_report_channel?: boolean;
          daily_report_group?: boolean;
          low_quality_alert_enabled?: boolean;
          min_call_duration_minutes?: number;
          organization_id?: string;
          performance_bot?: boolean;
          performance_channel?: boolean;
          performance_group?: boolean;
          performance_web?: boolean;
          quality_threshold?: number;
          technical_bot?: boolean;
          technical_channel?: boolean;
          technical_group?: boolean;
          technical_web?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "org_notification_settings_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      org_work_schedule: {
        Row: {
          alerts_enabled: boolean;
          end_time: string;
          manager_specific_schedule: boolean;
          organization_id: string;
          start_time: string;
          updated_at: string;
          updated_by: string | null;
          work_days: number[];
        };
        Insert: {
          alerts_enabled?: boolean;
          end_time?: string;
          manager_specific_schedule?: boolean;
          organization_id: string;
          start_time?: string;
          updated_at?: string;
          updated_by?: string | null;
          work_days?: number[];
        };
        Update: {
          alerts_enabled?: boolean;
          end_time?: string;
          manager_specific_schedule?: boolean;
          organization_id?: string;
          start_time?: string;
          updated_at?: string;
          updated_by?: string | null;
          work_days?: number[];
        };
        Relationships: [
          {
            foreignKeyName: "org_work_schedule_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      org_external_api_tokens: {
        Row: {
          created_at: string;
          created_by: string | null;
          organization_id: string;
          revoked_at: string | null;
          token: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          organization_id: string;
          revoked_at?: string | null;
          token: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          organization_id?: string;
          revoked_at?: string | null;
          token?: string;
        };
        Relationships: [
          {
            foreignKeyName: "org_external_api_tokens_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "org_external_api_tokens_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      org_outgoing_webhooks: {
        Row: {
          created_at: string;
          created_by: string | null;
          headers: Json;
          name: string;
          organization_id: string;
          url: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          headers?: Json;
          name: string;
          organization_id: string;
          url: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          headers?: Json;
          name?: string;
          organization_id?: string;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "org_outgoing_webhooks_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "org_outgoing_webhooks_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      pipeline_stages: {
        Row: {
          amocrm_pipeline_id: number | null;
          amocrm_status_id: number | null;
          color: string;
          counts_as_lost_override: boolean;
          counts_as_won_override: boolean;
          created_at: string;
          id: string;
          is_lost: boolean;
          is_won: boolean;
          key: string;
          name: string;
          organization_id: string;
          pipeline_id: string | null;
          pipeline_name: string | null;
          position: number;
          probability: number;
        };
        Insert: {
          amocrm_pipeline_id?: number | null;
          amocrm_status_id?: number | null;
          color?: string;
          counts_as_lost_override?: boolean;
          counts_as_won_override?: boolean;
          created_at?: string;
          id?: string;
          is_lost?: boolean;
          is_won?: boolean;
          key: string;
          name: string;
          organization_id: string;
          pipeline_id?: string | null;
          pipeline_name?: string | null;
          position: number;
          probability?: number;
        };
        Update: {
          amocrm_pipeline_id?: number | null;
          amocrm_status_id?: number | null;
          color?: string;
          counts_as_lost_override?: boolean;
          counts_as_won_override?: boolean;
          created_at?: string;
          id?: string;
          is_lost?: boolean;
          is_won?: boolean;
          key?: string;
          name?: string;
          organization_id?: string;
          pipeline_id?: string | null;
          pipeline_name?: string | null;
          position?: number;
          probability?: number;
        };
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pipeline_stages_pipeline_id_fkey";
            columns: ["pipeline_id"];
            isOneToOne: false;
            referencedRelation: "pipelines";
            referencedColumns: ["id"];
          },
        ];
      };
      pipelines: {
        Row: {
          color: string;
          created_at: string;
          created_by: string | null;
          id: string;
          is_default: boolean;
          name: string;
          organization_id: string;
          position: number;
          updated_at: string;
        };
        Insert: {
          color?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_default?: boolean;
          name: string;
          organization_id: string;
          position?: number;
          updated_at?: string;
        };
        Update: {
          color?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_default?: boolean;
          name?: string;
          organization_id?: string;
          position?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pipelines_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pipelines_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      pipeline_stage_rules: {
        Row: {
          created_at: string;
          id: string;
          organization_id: string;
          requires_note: boolean;
          requires_task: boolean;
          stage_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          organization_id: string;
          requires_note?: boolean;
          requires_task?: boolean;
          stage_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          organization_id?: string;
          requires_note?: boolean;
          requires_task?: boolean;
          stage_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pipeline_stage_rules_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pipeline_stage_rules_stage_id_fkey";
            columns: ["stage_id"];
            isOneToOne: true;
            referencedRelation: "pipeline_stages";
            referencedColumns: ["id"];
          },
        ];
      };
      lead_duplicate_flags: {
        Row: {
          attempted_by: string | null;
          created_at: string;
          id: string;
          matched_contact_id: string | null;
          matched_lead_id: string | null;
          new_lead_id: string | null;
          organization_id: string;
          overridden: boolean;
          phone: string;
          source: string;
        };
        Insert: {
          attempted_by?: string | null;
          created_at?: string;
          id?: string;
          matched_contact_id?: string | null;
          matched_lead_id?: string | null;
          new_lead_id?: string | null;
          organization_id: string;
          overridden?: boolean;
          phone: string;
          source?: string;
        };
        Update: {
          attempted_by?: string | null;
          created_at?: string;
          id?: string;
          matched_contact_id?: string | null;
          matched_lead_id?: string | null;
          new_lead_id?: string | null;
          organization_id?: string;
          overridden?: boolean;
          phone?: string;
          source?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lead_duplicate_flags_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      org_telephony_credentials: {
        Row: {
          api_key: string | null;
          api_secret: string | null;
          caller_id: string | null;
          connected_at: string | null;
          connected_by: string | null;
          created_at: string;
          organization_id: string;
          pbx_domain: string | null;
          provider: string;
          sms_sender_name: string | null;
          updated_at: string;
        };
        Insert: {
          api_key?: string | null;
          api_secret?: string | null;
          caller_id?: string | null;
          connected_at?: string | null;
          connected_by?: string | null;
          created_at?: string;
          organization_id: string;
          pbx_domain?: string | null;
          provider?: string;
          sms_sender_name?: string | null;
          updated_at?: string;
        };
        Update: {
          api_key?: string | null;
          api_secret?: string | null;
          caller_id?: string | null;
          connected_at?: string | null;
          connected_by?: string | null;
          created_at?: string;
          organization_id?: string;
          pbx_domain?: string | null;
          provider?: string;
          sms_sender_name?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "org_telephony_credentials_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      pbx_calls: {
        Row: {
          contact_id: string | null;
          created_at: string;
          direction: string;
          duration_seconds: number;
          external_call_id: string | null;
          from_number: string | null;
          id: string;
          initiated_by: string | null;
          lead_id: string | null;
          organization_id: string;
          recording_url: string | null;
          status: string;
          to_number: string;
          updated_at: string;
        };
        Insert: {
          contact_id?: string | null;
          created_at?: string;
          direction?: string;
          duration_seconds?: number;
          external_call_id?: string | null;
          from_number?: string | null;
          id?: string;
          initiated_by?: string | null;
          lead_id?: string | null;
          organization_id: string;
          recording_url?: string | null;
          status?: string;
          to_number: string;
          updated_at?: string;
        };
        Update: {
          contact_id?: string | null;
          created_at?: string;
          direction?: string;
          duration_seconds?: number;
          external_call_id?: string | null;
          from_number?: string | null;
          id?: string;
          initiated_by?: string | null;
          lead_id?: string | null;
          organization_id?: string;
          recording_url?: string | null;
          status?: string;
          to_number?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pbx_calls_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pbx_calls_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pbx_calls_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
        ];
      };
      sms_log: {
        Row: {
          contact_id: string | null;
          created_at: string;
          external_message_id: string | null;
          id: string;
          lead_id: string | null;
          message: string;
          organization_id: string;
          sent_by: string | null;
          status: string;
          to_number: string;
        };
        Insert: {
          contact_id?: string | null;
          created_at?: string;
          external_message_id?: string | null;
          id?: string;
          lead_id?: string | null;
          message: string;
          organization_id: string;
          sent_by?: string | null;
          status?: string;
          to_number: string;
        };
        Update: {
          contact_id?: string | null;
          created_at?: string;
          external_message_id?: string | null;
          id?: string;
          lead_id?: string | null;
          message?: string;
          organization_id?: string;
          sent_by?: string | null;
          status?: string;
          to_number?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sms_log_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      lead_sources: {
        Row: {
          active: boolean;
          created_at: string;
          created_by: string | null;
          default_owner_id: string | null;
          default_pipeline_id: string | null;
          default_stage_id: string | null;
          field_mapping: Json;
          id: string;
          name: string;
          organization_id: string;
          source_type: string;
          updated_at: string;
          webhook_token: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          created_by?: string | null;
          default_owner_id?: string | null;
          default_pipeline_id?: string | null;
          default_stage_id?: string | null;
          field_mapping?: Json;
          id?: string;
          name: string;
          organization_id: string;
          source_type?: string;
          updated_at?: string;
          webhook_token?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          created_by?: string | null;
          default_owner_id?: string | null;
          default_pipeline_id?: string | null;
          default_stage_id?: string | null;
          field_mapping?: Json;
          id?: string;
          name?: string;
          organization_id?: string;
          source_type?: string;
          updated_at?: string;
          webhook_token?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lead_sources_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lead_sources_default_pipeline_id_fkey";
            columns: ["default_pipeline_id"];
            isOneToOne: false;
            referencedRelation: "pipelines";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lead_sources_default_stage_id_fkey";
            columns: ["default_stage_id"];
            isOneToOne: false;
            referencedRelation: "pipeline_stages";
            referencedColumns: ["id"];
          },
        ];
      };
      incoming_lead_log: {
        Row: {
          created_at: string;
          created_lead_id: string | null;
          error: string | null;
          id: string;
          lead_source_id: string | null;
          organization_id: string | null;
          payload: Json;
          status: string;
        };
        Insert: {
          created_at?: string;
          created_lead_id?: string | null;
          error?: string | null;
          id?: string;
          lead_source_id?: string | null;
          organization_id?: string | null;
          payload: Json;
          status?: string;
        };
        Update: {
          created_at?: string;
          created_lead_id?: string | null;
          error?: string | null;
          id?: string;
          lead_source_id?: string | null;
          organization_id?: string | null;
          payload?: Json;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "incoming_lead_log_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "incoming_lead_log_lead_source_id_fkey";
            columns: ["lead_source_id"];
            isOneToOne: false;
            referencedRelation: "lead_sources";
            referencedColumns: ["id"];
          },
        ];
      };
      web_forms: {
        Row: {
          active: boolean;
          created_at: string;
          created_by: string | null;
          default_owner_id: string | null;
          default_pipeline_id: string | null;
          default_stage_id: string | null;
          fields: Json;
          id: string;
          name: string;
          organization_id: string;
          slug: string;
          success_message: string | null;
          tag: string | null;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          created_by?: string | null;
          default_owner_id?: string | null;
          default_pipeline_id?: string | null;
          default_stage_id?: string | null;
          fields?: Json;
          id?: string;
          name: string;
          organization_id: string;
          slug?: string;
          success_message?: string | null;
          tag?: string | null;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          created_by?: string | null;
          default_owner_id?: string | null;
          default_pipeline_id?: string | null;
          default_stage_id?: string | null;
          fields?: Json;
          id?: string;
          name?: string;
          organization_id?: string;
          slug?: string;
          success_message?: string | null;
          tag?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "web_forms_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "web_forms_default_pipeline_id_fkey";
            columns: ["default_pipeline_id"];
            isOneToOne: false;
            referencedRelation: "pipelines";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "web_forms_default_stage_id_fkey";
            columns: ["default_stage_id"];
            isOneToOne: false;
            referencedRelation: "pipeline_stages";
            referencedColumns: ["id"];
          },
        ];
      };
      web_form_submissions: {
        Row: {
          created_at: string;
          created_lead_id: string | null;
          data: Json;
          form_id: string;
          id: string;
          ip_address: string | null;
          organization_id: string;
          user_agent: string | null;
        };
        Insert: {
          created_at?: string;
          created_lead_id?: string | null;
          data: Json;
          form_id: string;
          id?: string;
          ip_address?: string | null;
          organization_id: string;
          user_agent?: string | null;
        };
        Update: {
          created_at?: string;
          created_lead_id?: string | null;
          data?: Json;
          form_id?: string;
          id?: string;
          ip_address?: string | null;
          organization_id?: string;
          user_agent?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "web_form_submissions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "web_form_submissions_form_id_fkey";
            columns: ["form_id"];
            isOneToOne: false;
            referencedRelation: "web_forms";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          amocrm_user_id: number | null;
          avatar_url: string | null;
          branch: string | null;
          created_at: string;
          daily_target: number | null;
          department: string;
          email: string;
          full_name: string;
          id: string;
          kpi_percent: number;
          manager_id: string | null;
          monthly_target: number | null;
          organization_id: string;
          phone: string | null;
          position: string;
          role: Database["public"]["Enums"]["app_role"];
          team: string | null;
          telegram_ai_setup_answers: Json | null;
          telegram_ai_setup_step: number | null;
          telegram_chat_id: number | null;
          telegram_link_code: string | null;
          telegram_onboarding_answers: Json | null;
          telegram_onboarding_step: number | null;
          updated_at: string;
        };
        Insert: {
          amocrm_user_id?: number | null;
          avatar_url?: string | null;
          branch?: string | null;
          created_at?: string;
          daily_target?: number | null;
          department?: string;
          email: string;
          full_name?: string;
          id: string;
          kpi_percent?: number;
          manager_id?: string | null;
          monthly_target?: number | null;
          organization_id: string;
          phone?: string | null;
          position?: string;
          role?: Database["public"]["Enums"]["app_role"];
          team?: string | null;
          telegram_ai_setup_answers?: Json | null;
          telegram_ai_setup_step?: number | null;
          telegram_chat_id?: number | null;
          telegram_link_code?: string | null;
          telegram_onboarding_answers?: Json | null;
          telegram_onboarding_step?: number | null;
          updated_at?: string;
        };
        Update: {
          amocrm_user_id?: number | null;
          avatar_url?: string | null;
          branch?: string | null;
          created_at?: string;
          daily_target?: number | null;
          department?: string;
          email?: string;
          full_name?: string;
          id?: string;
          kpi_percent?: number;
          manager_id?: string | null;
          monthly_target?: number | null;
          organization_id?: string;
          phone?: string | null;
          position?: string;
          role?: Database["public"]["Enums"]["app_role"];
          team?: string | null;
          telegram_ai_setup_answers?: Json | null;
          telegram_ai_setup_step?: number | null;
          telegram_chat_id?: number | null;
          telegram_link_code?: string | null;
          telegram_onboarding_answers?: Json | null;
          telegram_onboarding_step?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_manager_id_fkey";
            columns: ["manager_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profiles_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      push_subscriptions: {
        Row: {
          auth: string;
          created_at: string;
          endpoint: string;
          id: string;
          organization_id: string;
          p256dh: string;
          profile_id: string;
        };
        Insert: {
          auth: string;
          created_at?: string;
          endpoint: string;
          id?: string;
          organization_id: string;
          p256dh: string;
          profile_id: string;
        };
        Update: {
          auth?: string;
          created_at?: string;
          endpoint?: string;
          id?: string;
          organization_id?: string;
          p256dh?: string;
          profile_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "push_subscriptions_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      rollout_plans: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          name: string;
          organization_id: string;
          start_date: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name: string;
          organization_id?: string;
          start_date: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name?: string;
          organization_id?: string;
          start_date?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rollout_plans_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rollout_plans_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      rollout_plan_tasks: {
        Row: {
          completed_at: string | null;
          created_at: string;
          day_number: number;
          id: string;
          note: string;
          organization_id: string;
          phase: string;
          plan_id: string;
          position: number;
          status: string;
          task: string;
          updated_at: string;
          weight: string;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          day_number: number;
          id?: string;
          note?: string;
          organization_id?: string;
          phase: string;
          plan_id: string;
          position?: number;
          status?: string;
          task: string;
          updated_at?: string;
          weight?: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          day_number?: number;
          id?: string;
          note?: string;
          organization_id?: string;
          phase?: string;
          plan_id?: string;
          position?: number;
          status?: string;
          task?: string;
          updated_at?: string;
          weight?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rollout_plan_tasks_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rollout_plan_tasks_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "rollout_plans";
            referencedColumns: ["id"];
          },
        ];
      };
      rollout_plan_phase_colors: {
        Row: {
          color: string;
          organization_id: string;
          phase: string;
          plan_id: string;
          updated_at: string;
        };
        Insert: {
          color: string;
          organization_id?: string;
          phase: string;
          plan_id: string;
          updated_at?: string;
        };
        Update: {
          color?: string;
          organization_id?: string;
          phase?: string;
          plan_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rollout_plan_phase_colors_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rollout_plan_phase_colors_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "rollout_plans";
            referencedColumns: ["id"];
          },
        ];
      };
      role_permissions: {
        Row: {
          action: string;
          allowed: boolean;
          id: string;
          organization_id: string;
          role: string;
        };
        Insert: {
          action: string;
          allowed?: boolean;
          id?: string;
          organization_id: string;
          role: string;
        };
        Update: {
          action?: string;
          allowed?: boolean;
          id?: string;
          organization_id?: string;
          role?: string;
        };
        Relationships: [
          {
            foreignKeyName: "role_permissions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      security_settings: {
        Row: {
          min_password_length: number;
          organization_id: string;
          require_number: boolean;
          require_symbol: boolean;
          require_uppercase: boolean;
          two_factor_required: boolean;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          min_password_length?: number;
          organization_id: string;
          require_number?: boolean;
          require_symbol?: boolean;
          require_uppercase?: boolean;
          two_factor_required?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          min_password_length?: number;
          organization_id?: string;
          require_number?: boolean;
          require_symbol?: boolean;
          require_uppercase?: boolean;
          two_factor_required?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "security_settings_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "security_settings_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      setting_lists: {
        Row: {
          created_at: string;
          id: string;
          list_type: string;
          name: string;
          organization_id: string;
          position: number;
          value: number | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          list_type: string;
          name: string;
          organization_id: string;
          position?: number;
          value?: number | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          list_type?: string;
          name?: string;
          organization_id?: string;
          position?: number;
          value?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "setting_lists_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      task_comments: {
        Row: {
          author_id: string | null;
          content: string;
          created_at: string;
          id: string;
          organization_id: string | null;
          task_id: string;
        };
        Insert: {
          author_id?: string | null;
          content: string;
          created_at?: string;
          id?: string;
          organization_id?: string | null;
          task_id: string;
        };
        Update: {
          author_id?: string | null;
          content?: string;
          created_at?: string;
          id?: string;
          organization_id?: string | null;
          task_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "task_comments_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_comments_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_comments_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
        ];
      };
      tasks: {
        Row: {
          amocrm_task_id: number | null;
          assignee_id: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          due_date: string | null;
          id: string;
          lead_id: string | null;
          organization_id: string;
          priority: Database["public"]["Enums"]["priority_level"];
          progress: number;
          status: Database["public"]["Enums"]["task_status"];
          title: string;
          updated_at: string;
        };
        Insert: {
          amocrm_task_id?: number | null;
          assignee_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          due_date?: string | null;
          id?: string;
          lead_id?: string | null;
          organization_id: string;
          priority?: Database["public"]["Enums"]["priority_level"];
          progress?: number;
          status?: Database["public"]["Enums"]["task_status"];
          title: string;
          updated_at?: string;
        };
        Update: {
          amocrm_task_id?: number | null;
          assignee_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          due_date?: string | null;
          id?: string;
          lead_id?: string | null;
          organization_id?: string;
          priority?: Database["public"]["Enums"]["priority_level"];
          progress?: number;
          status?: Database["public"]["Enums"]["task_status"];
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tasks_assignee_id_fkey";
            columns: ["assignee_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      telegram_login_requests: {
        Row: {
          created_at: string;
          email: string | null;
          expires_at: string;
          status: string;
          token: string;
          token_hash: string | null;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          expires_at?: string;
          status?: string;
          token: string;
          token_hash?: string | null;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          expires_at?: string;
          status?: string;
          token?: string;
          token_hash?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "telegram_login_requests_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      telegram_bind_codes: {
        Row: {
          code: string;
          created_by: string | null;
          expires_at: string;
          organization_id: string;
        };
        Insert: {
          code: string;
          created_by?: string | null;
          expires_at: string;
          organization_id: string;
        };
        Update: {
          code?: string;
          created_by?: string | null;
          expires_at?: string;
          organization_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "telegram_bind_codes_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "telegram_bind_codes_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      telegram_bound_chats: {
        Row: {
          bound_at: string;
          bound_by: string | null;
          chat_id: number;
          chat_type: string;
          id: string;
          organization_id: string;
          title: string | null;
        };
        Insert: {
          bound_at?: string;
          bound_by?: string | null;
          chat_id: number;
          chat_type: string;
          id?: string;
          organization_id: string;
          title?: string | null;
        };
        Update: {
          bound_at?: string;
          bound_by?: string | null;
          chat_id?: number;
          chat_type?: string;
          id?: string;
          organization_id?: string;
          title?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "telegram_bound_chats_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "telegram_bound_chats_bound_by_fkey";
            columns: ["bound_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      work_sessions: {
        Row: {
          clock_in: string;
          clock_out: string | null;
          created_at: string;
          id: string;
          organization_id: string | null;
          profile_id: string;
        };
        Insert: {
          clock_in?: string;
          clock_out?: string | null;
          created_at?: string;
          id?: string;
          organization_id?: string | null;
          profile_id: string;
        };
        Update: {
          clock_in?: string;
          clock_out?: string | null;
          created_at?: string;
          id?: string;
          organization_id?: string | null;
          profile_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "work_sessions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "work_sessions_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      current_org_id: { Args: never; Returns: string };
      current_user_role: {
        Args: never;
        Returns: Database["public"]["Enums"]["app_role"];
      };
      is_admin_or_manager: { Args: never; Returns: boolean };
      is_platform_owner: { Args: never; Returns: boolean };
      entities_as_of: {
        Args: { p_organization_id: string; p_entity_type: string; p_as_of: string };
        Returns: Json[];
      };
      delete_organization_data: { Args: { target_org_id: string }; Returns: undefined };
      leads_list_stats: {
        Args: { p_search: string | null; p_stage_id: string | null };
        Returns: { total: number; hot: number; avg_score: number; revenue: number }[];
      };
      leaderboard_stats: {
        Args: {
          p_from: string | null;
          p_to: string | null;
          p_funnel: string | null;
          p_stage_id: string | null;
          p_tags: string[] | null;
        };
        Returns: {
          owner_id: string;
          total_leads: number;
          won_leads: number;
          lost_leads: number;
          revenue: number;
        }[];
      };
      dashboard_kpis: {
        Args: {
          p_from: string | null;
          p_to: string | null;
          p_funnel: string | null;
          p_min_amount: number | null;
          p_max_amount: number | null;
        };
        Returns: {
          revenue_today: number;
          revenue_month: number;
          pipeline_value: number;
          open_deals_count: number;
          new_leads_today: number;
          won_this_week: number;
          lost_this_week: number;
          conversion: number;
        }[];
      };
      funnel_list_stats: {
        Args: Record<PropertyKey, never>;
        Returns: {
          funnel: string;
          total: number;
          value: number;
          won: number;
          late_funnel: number;
          hot: number;
          warm: number;
          cold: number;
        }[];
      };
      enabled_funnel_names: {
        Args: Record<PropertyKey, never>;
        Returns: string[] | null;
      };
      lead_analytics_action: {
        Args: {
          p_funnel: string | null;
          p_manager: string | null;
          p_since: string | null;
          p_team: string | null;
        };
        Returns: Json;
      };
      lead_analytics_quality: {
        Args: { p_funnel: string | null; p_manager: string | null; p_team: string | null };
        Returns: Json;
      };
      lead_analytics_current: {
        Args: { p_funnel: string | null; p_manager: string | null; p_team: string | null };
        Returns: Json;
      };
      lead_analytics_direction: {
        Args: { p_funnel: string | null; p_manager: string | null; p_team: string | null };
        Returns: Json;
      };
      lead_analytics_marketing: {
        Args: {
          p_funnel: string | null;
          p_manager: string | null;
          p_team: string | null;
          p_since: string | null;
          p_until: string | null;
        };
        Returns: Json;
      };
    };
    Enums: {
      app_role: "super_admin" | "manager" | "rep" | "platform_owner" | "rop" | "sotuv_menejeri";
      deal_status: "open" | "won" | "lost";
      lead_temperature: "Hot" | "Warm" | "Cold" | "VeryHot";
      priority_level: "Urgent" | "High" | "Normal" | "Low";
      task_status: "Todo" | "In progress" | "Review" | "Done";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["super_admin", "manager", "rep", "platform_owner", "rop", "sotuv_menejeri"],
      deal_status: ["open", "won", "lost"],
      lead_temperature: ["Hot", "Warm", "Cold", "VeryHot"],
      priority_level: ["Urgent", "High", "Normal", "Low"],
      task_status: ["Todo", "In progress", "Review", "Done"],
    },
  },
} as const;
