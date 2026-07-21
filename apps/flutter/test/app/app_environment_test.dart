import 'package:flutter_test/flutter_test.dart';
import 'package:vipro_multi_tracker/app/app_environment.dart';

void main() {
  test('constructor preserves Supabase values', () {
    const environment = AppEnvironment(
      supabaseUrl: 'https://example.supabase.co',
      supabasePublishableKey: 'sb_publishable_example',
    );
    expect(environment.supabaseUrl, contains('supabase.co'));
    expect(environment.supabasePublishableKey, startsWith('sb_publishable_'));
  });
}
