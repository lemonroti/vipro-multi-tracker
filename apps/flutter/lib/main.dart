import 'package:flutter/material.dart';
import 'package:home_widget/home_widget.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'app/app_environment.dart';
import 'app/tracker_app.dart';
import 'database/app_database.dart';
import 'widget/tracker_widget.dart';

Future<void> _initializeSupabase() async {
  final environment = AppEnvironment.fromDefines();
  await Supabase.initialize(
    url: environment.supabaseUrl,
    publishableKey: environment.supabasePublishableKey,
  );
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await _initializeSupabase();
  await registerTrackerWidgetCallback();
  runApp(TrackerApp(database: AppDatabase()));
}

@pragma('vm:entry-point')
Future<void> configureMain() async {
  WidgetsFlutterBinding.ensureInitialized();
  await _initializeSupabase();
  final widgetId =
      await HomeWidget.initiallyLaunchedFromHomeWidgetConfigure();
  if (widgetId == null) {
    await registerTrackerWidgetCallback();
    runApp(TrackerApp(database: AppDatabase()));
    return;
  }
  runApp(TrackerWidgetConfigurationScreen(widgetId: widgetId));
}
