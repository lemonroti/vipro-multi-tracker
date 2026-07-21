package com.lemonroti.multitracker

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.SharedPreferences
import android.net.Uri
import android.widget.RemoteViews
import es.antonborri.home_widget.HomeWidgetBackgroundIntent
import es.antonborri.home_widget.HomeWidgetProvider

class TrackerWidgetProvider : HomeWidgetProvider() {
    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
        widgetData: SharedPreferences,
    ) {
        appWidgetIds.forEach { appWidgetId ->
            val title = widgetData.getString("title.$appWidgetId", "Configure tracker")
            val icon = widgetData.getString("icon.$appWidgetId", "✦")
            val value = widgetData.getString("value.$appWidgetId", "—")
            val unit = widgetData.getString("unit.$appWidgetId", "")
            val status = widgetData.getString("status.$appWidgetId", "Tap to record")

            val views = RemoteViews(context.packageName, R.layout.tracker_widget).apply {
                setTextViewText(R.id.widget_icon, icon)
                setTextViewText(R.id.widget_title, title)
                setTextViewText(R.id.widget_value, "$value $unit".trim())
                setTextViewText(R.id.widget_status, status)

                val pendingIntent = HomeWidgetBackgroundIntent.getBroadcast(
                    context,
                    Uri.parse("vipromultitracker://record?id=$appWidgetId"),
                )
                setOnClickPendingIntent(R.id.widget_root, pendingIntent)
            }
            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}
