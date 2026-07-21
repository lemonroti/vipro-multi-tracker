import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:home_widget/home_widget.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../data/tracker_store.dart';
import '../database/app_database.dart';

const _widgetProviderName = 'TrackerWidgetProvider';
const _qualifiedWidgetProvider =
    'com.lemonroti.multitracker.TrackerWidgetProvider';

Future<void> registerTrackerWidgetCallback() =>
    HomeWidget.registerInteractivityCallback(trackerWidgetBackgroundCallback);

@pragma('vm:entry-point')
Future<void> trackerWidgetBackgroundCallback(Uri? uri) async {
  WidgetsFlutterBinding.ensureInitialized();
  if (uri == null || uri.host != 'record') {
    return;
  }
  final widgetId = int.tryParse(uri.queryParameters['id'] ?? '');
  if (widgetId == null) {
    return;
  }

  final session = Supabase.instance.client.auth.currentSession;
  if (session == null) {
    await _saveStatus(widgetId, 'Open app and sign in');
    return;
  }

  final trackerId = await HomeWidget.getWidgetData<String>(
    'trackerId.$widgetId',
  );
  final rawValue = await HomeWidget.getWidgetData<String>('value.$widgetId');
  final unit = await HomeWidget.getWidgetData<String>('unit.$widgetId') ?? '';
  final value = double.tryParse(rawValue ?? '');
  if (trackerId == null || value == null || value <= 0) {
    await _saveStatus(widgetId, 'Reconfigure widget');
    return;
  }

  final database = AppDatabase();
  try {
    final trackerQuery = database.select(database.localTrackers)
      ..where((row) => row.userId.equals(session.user.id))
      ..where((row) => row.id.equals(trackerId))
      ..where((row) => row.deletedAt.isNull());
    final tracker = await trackerQuery.getSingleOrNull();
    if (tracker == null) {
      await _saveStatus(widgetId, 'Tracker unavailable');
      return;
    }

    final store = TrackerStore(
      database: database,
      client: Supabase.instance.client,
      userId: session.user.id,
    );
    await store.addLog(
      trackerId: trackerId,
      value: value,
      occurredAt: DateTime.now(),
      source: 'android-widget',
    );
    await _saveStatus(widgetId, 'Recorded +${_number(value)} $unit'.trim());
  } catch (_) {
    await _saveStatus(widgetId, 'Saved locally — sync pending');
  } finally {
    await database.close();
  }
}

Future<void> _saveStatus(int widgetId, String status) async {
  await HomeWidget.saveWidgetData<String>('status.$widgetId', status);
  await HomeWidget.updateWidget(
    androidName: _widgetProviderName,
    qualifiedAndroidName: _qualifiedWidgetProvider,
  );
}

class TrackerWidgetConfigurationScreen extends StatefulWidget {
  const TrackerWidgetConfigurationScreen({super.key, required this.widgetId});

  final String widgetId;

  @override
  State<TrackerWidgetConfigurationScreen> createState() =>
      _TrackerWidgetConfigurationScreenState();
}

class _TrackerWidgetConfigurationScreenState
    extends State<TrackerWidgetConfigurationScreen> {
  final database = AppDatabase();
  final titleController = TextEditingController();
  final valueController = TextEditingController();
  TrackerStore? store;
  String? selectedTrackerId;
  bool loading = true;
  bool saving = false;
  String? error;

  @override
  void initState() {
    super.initState();
    _initialize();
  }

  Future<void> _initialize() async {
    final session = Supabase.instance.client.auth.currentSession;
    if (session == null) {
      setState(() {
        loading = false;
        error = 'Sign in to the app before adding this widget.';
      });
      return;
    }
    final trackerStore = TrackerStore(
      database: database,
      client: Supabase.instance.client,
      userId: session.user.id,
    );
    try {
      await trackerStore.initialize();
      if (mounted) {
        setState(() {
          store = trackerStore;
          loading = false;
        });
      }
    } catch (exception) {
      if (mounted) {
        setState(() {
          store = trackerStore;
          loading = false;
          error = exception.toString();
        });
      }
    }
  }

  @override
  void dispose() {
    titleController.dispose();
    valueController.dispose();
    database.close();
    super.dispose();
  }

  Future<void> _save(LocalTracker tracker) async {
    final value = double.tryParse(valueController.text.trim());
    if (value == null || value <= 0) {
      setState(() => error = 'Enter a positive quick value.');
      return;
    }
    setState(() {
      saving = true;
      error = null;
    });
    final id = widget.widgetId;
    final title = titleController.text.trim().isEmpty
        ? tracker.name
        : titleController.text.trim();
    await Future.wait([
      HomeWidget.saveWidgetData<String>('trackerId.$id', tracker.id),
      HomeWidget.saveWidgetData<String>('title.$id', title),
      HomeWidget.saveWidgetData<String>('value.$id', _number(value)),
      HomeWidget.saveWidgetData<String>('unit.$id', tracker.unit),
      HomeWidget.saveWidgetData<String>('icon.$id', tracker.icon),
      HomeWidget.saveWidgetData<String>('status.$id', 'Tap to record'),
    ]);
    await HomeWidget.updateWidget(
      androidName: _widgetProviderName,
      qualifiedAndroidName: _qualifiedWidgetProvider,
    );
    await HomeWidget.finishHomeWidgetConfigure();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF6D4AFF)),
      ),
      home: Scaffold(
        appBar: AppBar(title: const Text('Configure tracker widget')),
        body: loading
            ? const Center(child: CircularProgressIndicator())
            : error != null && store == null
            ? _ConfigurationError(message: error!)
            : StreamBuilder<List<LocalTracker>>(
                stream: store!.trackers,
                initialData: const [],
                builder: (context, snapshot) {
                  final trackers = (snapshot.data ?? const [])
                      .where((tracker) => tracker.active)
                      .toList();
                  if (trackers.isEmpty) {
                    return const _ConfigurationError(
                      message:
                          'Create at least one active tracker in the app first.',
                    );
                  }
                  selectedTrackerId ??= trackers.first.id;
                  final selected = trackers.firstWhere(
                    (tracker) => tracker.id == selectedTrackerId,
                    orElse: () => trackers.first,
                  );
                  if (valueController.text.isEmpty) {
                    final presets = (jsonDecode(selected.presetsJson) as List)
                        .map((item) => (item as num).toDouble())
                        .toList();
                    valueController.text = _number(
                      presets.isEmpty ? 1 : presets.first,
                    );
                  }
                  return ListView(
                    padding: const EdgeInsets.all(20),
                    children: [
                      DropdownButtonFormField<String>(
                        initialValue: selectedTrackerId,
                        decoration: const InputDecoration(labelText: 'Tracker'),
                        items: [
                          for (final tracker in trackers)
                            DropdownMenuItem(
                              value: tracker.id,
                              child: Text('${tracker.icon} ${tracker.name}'),
                            ),
                        ],
                        onChanged: (value) {
                          if (value == null) {
                            return;
                          }
                          setState(() {
                            selectedTrackerId = value;
                            valueController.clear();
                          });
                        },
                      ),
                      const SizedBox(height: 14),
                      TextField(
                        controller: valueController,
                        keyboardType: const TextInputType.numberWithOptions(
                          decimal: true,
                        ),
                        decoration: InputDecoration(
                          labelText: 'Quick value (${selected.unit})',
                        ),
                      ),
                      const SizedBox(height: 14),
                      TextField(
                        controller: titleController,
                        decoration: const InputDecoration(
                          labelText: 'Widget title (optional)',
                        ),
                      ),
                      if (error != null) ...[
                        const SizedBox(height: 12),
                        Text(
                          error!,
                          style: TextStyle(
                            color: Theme.of(context).colorScheme.error,
                          ),
                        ),
                      ],
                      const SizedBox(height: 22),
                      FilledButton.icon(
                        onPressed: saving ? null : () => _save(selected),
                        icon: const Icon(Icons.widgets_outlined),
                        label: Text(saving ? 'Saving…' : 'Add widget'),
                      ),
                    ],
                  );
                },
              ),
      ),
    );
  }
}

class _ConfigurationError extends StatelessWidget {
  const _ConfigurationError({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(28),
      child: Text(message, textAlign: TextAlign.center),
    ),
  );
}

String _number(double value) => value == value.roundToDouble()
    ? value.toInt().toString()
    : value.toStringAsFixed(1);
