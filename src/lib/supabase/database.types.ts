export type Database = {
  public: {
    Tables: {
      posts: {
        Row: {
          id: string;
          user_id: string;
          content: string | null;
          created_at: string | null;
          image_urls: string[] | null;
          place_name: string | null;
          place_address: string | null;
          place_id: string | null;
          image_variants: any | null;
          recommend_score: number | null;
          price_yen: number | null;
          price_range: string | null;
          visited_on: string | null;
          image_assets: any; // jsonb
          cover_square_url: string | null;
          cover_pin_url: string | null;
          cover_full_url: string | null;
          taste_score: number | null;
          atmosphere_score: number | null;
          service_score: number | null;
        };
      };
      places: {
        Row: {
          place_id: string;
          name: string | null;
          address: string | null;
          lat: number | null;
          lng: number | null;
          photo_url: string | null;
          updated_at: string | null;
          place_types: string[] | null;
          primary_type: string | null;
          types_fetched_at: string | null;
          primary_genre: string | null;
          genre_tags: string[];
          genre_source: string | null;
          genre_confidence: number | null;
          genre_updated_at: string;
          country_code: string | null;
          country_name: string | null;
          admin1: string | null;
          locality: string | null;
          sublocality: string | null;
          area_label_ja: string | null;
          area_source: string | null;
          area_updated_at: string | null;
          area_label: string | null;
          area_key: string | null;
          area_label_en: string | null;
          search_text: string | null;
        };
      };
    };
  };
};
