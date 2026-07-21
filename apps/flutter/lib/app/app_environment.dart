class AppEnvironment {
  const AppEnvironment({
    required this.supabaseUrl,
    required this.supabasePublishableKey,
  });

  final String supabaseUrl;
  final String supabasePublishableKey;

  factory AppEnvironment.fromDefines() {
    const url = String.fromEnvironment('SUPABASE_URL');
    const key = String.fromEnvironment('SUPABASE_PUBLISHABLE_KEY');
    if (url.isEmpty || key.isEmpty) {
      throw StateError('Supabase configuration is missing.');
    }
    return const AppEnvironment(
      supabaseUrl: url,
      supabasePublishableKey: key,
    );
  }
}
