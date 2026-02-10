export type EditorOverrides = {
  company?: string;
  title?: string;
  location?: string;
  offers?: string[];
  expects?: string[];
  theme?: {
    primary?: string;
    secondary?: string;
    text?: string;
    logo_bg?: string;
  };
  jingle?: string | null;
};

type ExtractedLike = {
  company?: string;
  title?: string;
  location?: string;
  language?: 'fi' | 'en';
  brand_colors?: {
    primary?: string;
    secondary?: string;
    text?: string;
    logo_bg?: string;
  };
};

type BubblesLike = {
  offers?: Array<{text?: string}>;
  expects?: Array<{text?: string}>;
};

export type InputPropsShape = {
  company: string;
  title: string;
  location?: string;
  offers: string[];
  expects: string[];
  theme?: {
    primary?: string;
    secondary?: string;
    text?: string;
    logo_bg?: string;
  };
  lang?: 'fi' | 'en';
};

export function applyOverrides(extracted: ExtractedLike, bubbles: BubblesLike, overrides?: EditorOverrides): InputPropsShape {
  const offers = (overrides?.offers ?? bubbles.offers ?? [])
    .map((b: any) => (typeof b === 'string' ? b : b?.text))
    .filter(Boolean) as string[];
  const expects = (overrides?.expects ?? bubbles.expects ?? [])
    .map((b: any) => (typeof b === 'string' ? b : b?.text))
    .filter(Boolean) as string[];

  return {
    company: overrides?.company ?? extracted.company ?? '',
    title: overrides?.title ?? extracted.title ?? '',
    location: overrides?.location ?? extracted.location ?? undefined,
    offers,
    expects,
    theme: {
      primary: overrides?.theme?.primary ?? extracted.brand_colors?.primary,
      secondary: overrides?.theme?.secondary ?? extracted.brand_colors?.secondary,
      text: overrides?.theme?.text ?? extracted.brand_colors?.text,
      logo_bg: overrides?.theme?.logo_bg ?? extracted.brand_colors?.logo_bg
    },
    lang: extracted.language
  };
}
