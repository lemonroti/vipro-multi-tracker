import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'app/app_environment.dart';
import 'app/tracker_app.dart';
import 'database/app_database.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final environment = AppEnvironment.fromDefines();
  await Supabase.initialize(
    url: environment.supabaseUrl,
    anonKey: environment.supabasePublishableKey,
  );
  runApp(TrackerApp(database: AppDatabase()));
}
