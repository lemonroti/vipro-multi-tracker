import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../data/tracker_store.dart';
import '../database/app_database.dart';
import '../domain/models.dart';

class TrackerShell extends StatefulWidget {
  const TrackerShell({
    super.key,
    required this.database,
    required this.user,
    required this.onThemeChanged,
  });

  final AppDatabase database;
  final User user;
  final ValueChanged<ThemeMode> onThemeChanged;

  @override
  State<TrackerShell> createState() => _TrackerShellState();
}

class _TrackerShellState extends State<TrackerShell>
    with WidgetsBindingObserver {
  late final TrackerStore store;
  int index = 0;
  bool loading = true;
  String? loadError;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    store = TrackerStore(
      database: widget.database,
      client: Supabase.instance.client,
      userId: widget.user.id,
    );
    _initialize();
  }

  Future<void> _initialize() async {
    try {
      await store.initialize();
    } catch (error) {
      loadError = error.toString();
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) store.sync();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final titles = ['Home', 'History', 'Trackers', 'Settings'];
    return Scaffold(
      appBar: AppBar(
        title: Text(
          titles[index],
          style: const TextStyle(fontWeight: FontWeight.w800),
        ),
        actions: [
          StreamBuilder<int>(
            stream: store.pendingCount,
            initialData: 0,
            builder: (context, snapshot) {
              final count = snapshot.data ?? 0;
              return Padding(
                padding: const EdgeInsets.only(right: 12),
                child: ActionChip(
                  avatar: Icon(
                    count == 0
                        ? Icons.cloud_done_outlined
                        : Icons.cloud_upload_outlined,
                    size: 18,
                  ),
                  label: Text(count == 0 ? 'Synced' : '$count pending'),
                  onPressed: () => store.sync(),
                ),
              );
            },
          ),
        ],
      ),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : loadError != null
          ? _ErrorState(message: loadError!, retry: _initialize)
          : IndexedStack(
              index: index,
              children: [
                _HomeTab(store: store),
                _HistoryTab(store: store),
                _TrackersTab(store: store),
                _SettingsTab(
                  store: store,
                  user: widget.user,
                  onThemeChanged: widget.onThemeChanged,
                ),
              ],
            ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (value) => setState(() => index = value),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home),
            label: 'Home',
          ),
          NavigationDestination(
            icon: Icon(Icons.history_outlined),
            selectedIcon: Icon(Icons.history),
            label: 'History',
          ),
          NavigationDestination(
            icon: Icon(Icons.grid_view_outlined),
            selectedIcon: Icon(Icons.grid_view),
            label: 'Trackers',
          ),
          NavigationDestination(
            icon: Icon(Icons.settings_outlined),
            selectedIcon: Icon(Icons.settings),
            label: 'Settings',
          ),
        ],
      ),
    );
  }
}

class _HomeTab extends StatelessWidget {
  const _HomeTab({required this.store});
  final TrackerStore store;

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<List<LocalTracker>>(
      stream: store.trackers,
      initialData: const [],
      builder: (context, trackerSnapshot) {
        return StreamBuilder<List<LocalTrackingLog>>(
          stream: store.logs,
          initialData: const [],
          builder: (context, logSnapshot) {
            final trackers = (trackerSnapshot.data ?? const [])
                .where((item) => item.active)
                .toList();
            final logs = logSnapshot.data ?? const [];
            if (trackers.isEmpty) {
              return const _EmptyState(
                icon: Icons.add_task,
                title: 'No active trackers',
                message: 'Open the Trackers tab to create your first tracker.',
              );
            }
            return ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: trackers.length,
              separatorBuilder: (_, _) => const SizedBox(height: 12),
              itemBuilder: (context, i) {
                final tracker = trackers[i];
                final today = DateUtils.dateOnly(DateTime.now());
                final total = logs
                    .where(
                      (log) =>
                          log.trackerId == tracker.id &&
                          DateUtils.isSameDay(log.occurredAt.toLocal(), today),
                    )
                    .fold<double>(0, (sum, log) => sum + log.value);
                final presets = (jsonDecode(tracker.presetsJson) as List)
                    .map((value) => (value as num).toDouble())
                    .toList();
                return Card(
                  child: Padding(
                    padding: const EdgeInsets.all(18),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Text(
                              tracker.icon,
                              style: const TextStyle(fontSize: 28),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    tracker.name,
                                    style: Theme.of(context)
                                        .textTheme
                                        .titleLarge
                                        ?.copyWith(fontWeight: FontWeight.w800),
                                  ),
                                  Text(
                                    'Today: ${_number(total)} ${tracker.unit}',
                                  ),
                                ],
                              ),
                            ),
                            if (tracker.goal != null)
                              Text(
                                '${((total / tracker.goal!) * 100).clamp(0, 999).round()}%',
                              ),
                          ],
                        ),
                        if (tracker.goal != null) ...[
                          const SizedBox(height: 12),
                          LinearProgressIndicator(
                            value: (total / tracker.goal!).clamp(0, 1),
                          ),
                        ],
                        const SizedBox(height: 16),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            for (final value in presets)
                              FilledButton.tonal(
                                onPressed: () => store.addLog(
                                  trackerId: tracker.id,
                                  value: value,
                                  occurredAt: DateTime.now(),
                                ),
                                child: Text('+${_number(value)}'),
                              ),
                            OutlinedButton.icon(
                              onPressed: () => _showLogEditor(
                                context,
                                store,
                                tracker: tracker,
                              ),
                              icon: const Icon(Icons.edit_outlined, size: 18),
                              label: const Text('Custom'),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                );
              },
            );
          },
        );
      },
    );
  }
}

class _HistoryTab extends StatelessWidget {
  const _HistoryTab({required this.store});
  final TrackerStore store;

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<List<LocalTracker>>(
      stream: store.trackers,
      initialData: const [],
      builder: (context, trackerSnapshot) {
        final trackerMap = {
          for (final tracker in trackerSnapshot.data ?? const <LocalTracker>[])
            tracker.id: tracker,
        };
        return StreamBuilder<List<LocalTrackingLog>>(
          stream: store.logs,
          initialData: const [],
          builder: (context, snapshot) {
            final logs = snapshot.data ?? const [];
            if (logs.isEmpty) {
              return const _EmptyState(
                icon: Icons.history,
                title: 'No records yet',
                message: 'Quick-record from Home to create your first entry.',
              );
            }
            return ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: logs.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (context, i) {
                final log = logs[i];
                final tracker = trackerMap[log.trackerId];
                return ListTile(
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 6,
                  ),
                  leading: CircleAvatar(child: Text(tracker?.icon ?? '•')),
                  title: Text(
                    '${tracker?.name ?? 'Deleted tracker'} · ${_number(log.value)} ${tracker?.unit ?? ''}',
                  ),
                  subtitle: Text(
                    '${DateFormat.yMMMd().add_jm().format(log.occurredAt.toLocal())}${log.note.isEmpty ? '' : '\n${log.note}'}',
                  ),
                  isThreeLine: log.note.isNotEmpty,
                  trailing: PopupMenuButton<String>(
                    onSelected: (action) {
                      if (action == 'edit' && tracker != null) {
                        _showLogEditor(
                          context,
                          store,
                          tracker: tracker,
                          log: log,
                        );
                      }
                      if (action == 'delete') {
                        store.deleteLog(log);
                      }
                    },
                    itemBuilder: (_) => const [
                      PopupMenuItem(value: 'edit', child: Text('Edit')),
                      PopupMenuItem(value: 'delete', child: Text('Delete')),
                    ],
                  ),
                );
              },
            );
          },
        );
      },
    );
  }
}

class _TrackersTab extends StatelessWidget {
  const _TrackersTab({required this.store});
  final TrackerStore store;

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<List<LocalTracker>>(
      stream: store.trackers,
      initialData: const [],
      builder: (context, snapshot) {
        final trackers = snapshot.data ?? const [];
        return Scaffold(
          body: trackers.isEmpty
              ? const _EmptyState(
                  icon: Icons.grid_view,
                  title: 'No trackers',
                  message: 'Create a tracker for anything you want to measure.',
                )
              : ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: trackers.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 8),
                  itemBuilder: (context, i) {
                    final tracker = trackers[i];
                    return Card(
                      child: ListTile(
                        leading: CircleAvatar(child: Text(tracker.icon)),
                        title: Text(
                          tracker.name,
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                        subtitle: Text(
                          '${tracker.unit} · ${tracker.active ? 'Active' : 'Hidden'}',
                        ),
                        onTap: () => _showTrackerEditor(
                          context,
                          store,
                          tracker: tracker,
                        ),
                        trailing: PopupMenuButton<String>(
                          onSelected: (action) {
                            if (action == 'edit') {
                              _showTrackerEditor(
                                context,
                                store,
                                tracker: tracker,
                              );
                            }
                            if (action == 'delete') {
                              store.deleteTracker(tracker);
                            }
                          },
                          itemBuilder: (_) => const [
                            PopupMenuItem(value: 'edit', child: Text('Edit')),
                            PopupMenuItem(
                              value: 'delete',
                              child: Text('Delete'),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
          floatingActionButton: FloatingActionButton.extended(
            onPressed: () => _showTrackerEditor(context, store),
            icon: const Icon(Icons.add),
            label: const Text('New tracker'),
          ),
        );
      },
    );
  }
}

class _SettingsTab extends StatelessWidget {
  const _SettingsTab({
    required this.store,
    required this.user,
    required this.onThemeChanged,
  });
  final TrackerStore store;
  final User user;
  final ValueChanged<ThemeMode> onThemeChanged;

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<LocalUserSetting?>(
      stream: store.settings,
      builder: (context, snapshot) {
        final theme = snapshot.data?.theme ?? 'system';
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Appearance',
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 12),
                    DropdownButtonFormField<String>(
                      initialValue: theme,
                      decoration: const InputDecoration(labelText: 'Theme'),
                      items: const [
                        DropdownMenuItem(
                          value: 'system',
                          child: Text('Follow device'),
                        ),
                        DropdownMenuItem(value: 'light', child: Text('Light')),
                        DropdownMenuItem(value: 'dark', child: Text('Dark')),
                      ],
                      onChanged: (value) {
                        if (value == null) {
                          return;
                        }
                        store.saveTheme(value);
                        onThemeChanged(switch (value) {
                          'light' => ThemeMode.light,
                          'dark' => ThemeMode.dark,
                          _ => ThemeMode.system,
                        });
                      },
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            Card(
              child: ListTile(
                leading: const Icon(Icons.sync),
                title: const Text('Sync now'),
                subtitle: const Text(
                  'Push pending changes and refresh cloud data.',
                ),
                onTap: () => store.sync(),
              ),
            ),
            const SizedBox(height: 12),
            Card(
              child: Column(
                children: [
                  ListTile(
                    leading: const Icon(Icons.account_circle_outlined),
                    title: const Text('Signed in as'),
                    subtitle: Text(user.email ?? user.id),
                  ),
                  ListTile(
                    leading: const Icon(Icons.logout),
                    title: const Text('Sign out'),
                    onTap: () => Supabase.instance.client.auth.signOut(),
                  ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}

Future<void> _showTrackerEditor(
  BuildContext context,
  TrackerStore store, {
  LocalTracker? tracker,
}) async {
  final name = TextEditingController(text: tracker?.name ?? '');
  final unit = TextEditingController(text: tracker?.unit ?? 'minute');
  final icon = TextEditingController(text: tracker?.icon ?? '✦');
  final goal = TextEditingController(text: tracker?.goal?.toString() ?? '');
  final presets = TextEditingController(
    text: tracker == null
        ? '5, 10, 15'
        : (jsonDecode(tracker.presetsJson) as List).join(', '),
  );
  var active = tracker?.active ?? true;
  String? error;
  await showDialog<void>(
    context: context,
    builder: (context) => StatefulBuilder(
      builder: (context, setDialogState) => AlertDialog(
        title: Text(tracker == null ? 'Create tracker' : 'Edit tracker'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: name,
                decoration: const InputDecoration(labelText: 'Name'),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: icon,
                      decoration: const InputDecoration(labelText: 'Icon'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    flex: 2,
                    child: TextField(
                      controller: unit,
                      decoration: const InputDecoration(labelText: 'Unit'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              TextField(
                controller: goal,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Daily goal (optional)',
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: presets,
                decoration: const InputDecoration(labelText: 'Quick values'),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Active'),
                value: active,
                onChanged: (value) => setDialogState(() => active = value),
              ),
              if (error != null)
                Text(
                  error!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () async {
              try {
                final input = TrackerInput(
                  name: name.text,
                  unit: unit.text,
                  icon: icon.text,
                  color: tracker?.color ?? '#6d4aff',
                  goal: goal.text.trim().isEmpty
                      ? null
                      : double.parse(goal.text),
                  presets: presets.text
                      .split(',')
                      .map((item) => double.parse(item.trim()))
                      .toList(),
                  active: active,
                );
                if (tracker == null) {
                  await store.createTracker(input);
                } else {
                  await store.updateTracker(tracker, input);
                }
                if (context.mounted) Navigator.pop(context);
              } catch (exception) {
                setDialogState(
                  () => error = exception.toString().replaceFirst(
                    'FormatException: ',
                    '',
                  ),
                );
              }
            },
            child: const Text('Save'),
          ),
        ],
      ),
    ),
  );
  name.dispose();
  unit.dispose();
  icon.dispose();
  goal.dispose();
  presets.dispose();
}

Future<void> _showLogEditor(
  BuildContext context,
  TrackerStore store, {
  required LocalTracker tracker,
  LocalTrackingLog? log,
}) async {
  final value = TextEditingController(text: log?.value.toString() ?? '');
  final note = TextEditingController(text: log?.note ?? '');
  var occurredAt = log?.occurredAt.toLocal() ?? DateTime.now();
  String? error;
  await showDialog<void>(
    context: context,
    builder: (context) => StatefulBuilder(
      builder: (context, setDialogState) => AlertDialog(
        title: Text(log == null ? 'Record ${tracker.name}' : 'Edit record'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: value,
              autofocus: true,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              decoration: InputDecoration(labelText: 'Value (${tracker.unit})'),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: note,
              decoration: const InputDecoration(labelText: 'Note (optional)'),
            ),
            const SizedBox(height: 10),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.schedule),
              title: Text(DateFormat.yMMMd().add_jm().format(occurredAt)),
              onTap: () async {
                final date = await showDatePicker(
                  context: context,
                  firstDate: DateTime(2020),
                  lastDate: DateTime.now().add(const Duration(days: 365)),
                  initialDate: occurredAt,
                );
                if (date == null || !context.mounted) {
                  return;
                }
                final time = await showTimePicker(
                  context: context,
                  initialTime: TimeOfDay.fromDateTime(occurredAt),
                );
                if (time == null) {
                  return;
                }
                setDialogState(
                  () => occurredAt = DateTime(
                    date.year,
                    date.month,
                    date.day,
                    time.hour,
                    time.minute,
                  ),
                );
              },
            ),
            if (error != null)
              Text(
                error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () async {
              try {
                final parsed = double.parse(value.text);
                if (log == null) {
                  await store.addLog(
                    trackerId: tracker.id,
                    value: parsed,
                    occurredAt: occurredAt,
                    note: note.text,
                  );
                } else {
                  await store.updateLog(
                    log,
                    value: parsed,
                    occurredAt: occurredAt,
                    note: note.text,
                  );
                }
                if (context.mounted) Navigator.pop(context);
              } catch (exception) {
                setDialogState(
                  () => error = exception.toString().replaceFirst(
                    'FormatException: ',
                    '',
                  ),
                );
              }
            },
            child: const Text('Save'),
          ),
        ],
      ),
    ),
  );
  value.dispose();
  note.dispose();
}

String _number(double value) => value == value.roundToDouble()
    ? value.toInt().toString()
    : value.toStringAsFixed(1);

class _EmptyState extends StatelessWidget {
  const _EmptyState({
    required this.icon,
    required this.title,
    required this.message,
  });
  final IconData icon;
  final String title;
  final String message;
  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 56, color: Theme.of(context).colorScheme.primary),
          const SizedBox(height: 16),
          Text(
            title,
            style: Theme.of(
              context,
            ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 8),
          Text(message, textAlign: TextAlign.center),
        ],
      ),
    ),
  );
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.retry});
  final String message;
  final VoidCallback retry;
  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.cloud_off, size: 56),
          const SizedBox(height: 16),
          const Text(
            'Could not load tracker data',
            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 20),
          ),
          const SizedBox(height: 8),
          Text(message, textAlign: TextAlign.center),
          const SizedBox(height: 16),
          FilledButton(onPressed: retry, child: const Text('Retry')),
        ],
      ),
    ),
  );
}
