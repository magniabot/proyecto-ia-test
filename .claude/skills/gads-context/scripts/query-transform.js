// Shared Google Ads row-to-CSV transforms for query.js.

export const microsFields = new Set([
    'metrics.average_cpc',
    'metrics.cost_per_conversion',
    'metrics.average_cost',
    'metrics.cost_per_all_conversions'
]);

export function createEnumFieldMap(enums) {
    return {
        // Keywords & criteria
        'ad_group_criterion.keyword.match_type': enums.KeywordMatchType,
        'ad_group_criterion.status': enums.AdGroupCriterionStatus,
        'ad_group_criterion.approval_status': enums.AdGroupCriterionApprovalStatus,
        'ad_group_criterion.system_serving_status': enums.CriterionSystemServingStatus,
        'ad_group_criterion.type': enums.CriterionType,
        'ad_group_criterion.quality_info.creative_quality_score': enums.QualityScoreBucket,
        'ad_group_criterion.quality_info.post_click_quality_score': enums.QualityScoreBucket,
        'ad_group_criterion.quality_info.search_predicted_ctr': enums.QualityScoreBucket,
        'ad_group_criterion.listing_group.type': enums.ListingGroupType,
        'ad_group_criterion.listing_group.case_value.product_category.level': enums.ProductCategoryLevel,
        'ad_group_criterion.listing_group.case_value.product_type.level': enums.ProductTypeLevel,
        'ad_group_criterion.listing_group.case_value.product_custom_attribute.index': enums.ProductCustomAttributeIndex,
        'campaign_criterion.keyword.match_type': enums.KeywordMatchType,
        'campaign_criterion.type': enums.CriterionType,
        'campaign_criterion.status': enums.CampaignCriterionStatus,
        'campaign_criterion.ad_schedule.day_of_week': enums.DayOfWeek,
        'campaign_criterion.ad_schedule.start_minute': enums.MinuteOfHour,
        'campaign_criterion.ad_schedule.end_minute': enums.MinuteOfHour,
        'campaign_criterion.device.type': enums.Device,
        'campaign_criterion.age_range.type': enums.AgeRangeType,
        'campaign_criterion.gender.type': enums.GenderType,
        'campaign_criterion.income_range.type': enums.IncomeRangeType,
        'ad_group_criterion.age_range.type': enums.AgeRangeType,
        'ad_group_criterion.gender.type': enums.GenderType,
        'ad_group_criterion.income_range.type': enums.IncomeRangeType,
        'ad_group_criterion.parental_status.type': enums.ParentalStatusType,
        'shared_criterion.keyword.match_type': enums.KeywordMatchType,
        // Campaign & ad group
        'campaign.status': enums.CampaignStatus,
        'campaign.advertising_channel_type': enums.AdvertisingChannelType,
        'campaign.bidding_strategy_type': enums.BiddingStrategyType,
        'bidding_strategy.type': enums.BiddingStrategyType,
        'bidding_strategy.status': enums.BiddingStrategyStatus,
        'campaign.target_impression_share.location': enums.TargetImpressionShareLocation,
        'bidding_strategy.target_impression_share.location': enums.TargetImpressionShareLocation,
        'bidding_data_exclusion.scope': enums.SeasonalityEventScope,
        'bidding_data_exclusion.devices': enums.Device,
        'bidding_data_exclusion.advertising_channel_types': enums.AdvertisingChannelType,
        'conversion_value_rule.status': enums.ConversionValueRuleStatus,
        'conversion_value_rule.geo_location_condition.geo_match_type': enums.ValueRuleGeoLocationMatchType,
        'conversion_value_rule.geo_location_condition.excluded_geo_match_type': enums.ValueRuleGeoLocationMatchType,
        'conversion_value_rule.device_condition.device_types': enums.ValueRuleDeviceType,
        'conversion_value_rule.action.operation': enums.ValueRuleOperation,
        'campaign.experiment_type': enums.CampaignExperimentType,
        'campaign.serving_status': enums.CampaignServingStatus,
        'campaign.payment_mode': enums.PaymentMode,
        'campaign_budget.status': enums.BudgetStatus,
        'campaign_budget.period': enums.BudgetPeriod,
        'campaign_budget.delivery_method': enums.BudgetDeliveryMethod,
        'campaign_budget.type': enums.BudgetType,
        'account_budget.status': enums.AccountBudgetStatus,
        'campaign.geo_target_type_setting.positive_geo_target_type': enums.PositiveGeoTargetType,
        'campaign.geo_target_type_setting.negative_geo_target_type': enums.NegativeGeoTargetType,
        'campaign.ad_serving_optimization_status': enums.AdServingOptimizationStatus,
        'ad_group.status': enums.AdGroupStatus,
        'ad_group.type': enums.AdGroupType,
        'ad_group_ad.status': enums.AdGroupAdStatus,
        // Segments
        'segments.ad_network_type': enums.AdNetworkType,
        'segments.device': enums.Device,
        'segments.day_of_week': enums.DayOfWeek,
        'segments.product_channel': enums.ProductChannel,
        'segments.product_condition': enums.ProductCondition,
        'segments.conversion_action_category': enums.ConversionActionCategory,
        // Assets
        'asset.type': enums.AssetType,
        'asset.policy_summary.approval_status': enums.PolicyApprovalStatus,
        'asset.policy_summary.review_status': enums.PolicyReviewStatus,
        'asset.image_asset.mime_type': enums.MimeType,
        'campaign_asset.field_type': enums.AssetFieldType,
        'campaign_asset.status': enums.AssetLinkStatus,
        'campaign_asset.primary_status': enums.AssetLinkPrimaryStatus,
        'ad_group_asset.field_type': enums.AssetFieldType,
        'ad_group_asset.status': enums.AssetLinkStatus,
        'ad_group_asset.primary_status': enums.AssetLinkPrimaryStatus,
        // Conversions
        'conversion_action.status': enums.ConversionActionStatus,
        'conversion_action.type': enums.ConversionActionType,
        'conversion_action.category': enums.ConversionActionCategory,
        'conversion_action.counting_type': enums.ConversionActionCountingType,
        'conversion_action.origin': enums.ConversionOrigin,
        'conversion_action.attribution_model_settings.attribution_model': enums.AttributionModel,
        'campaign_conversion_goal.category': enums.ConversionActionCategory,
        'campaign_conversion_goal.origin': enums.ConversionOrigin,
        // Geo
        'geographic_view.location_type': enums.GeoTargetingType,
        // Shopping
        'shopping_product.status': enums.ProductStatus,
        'shopping_product.availability': enums.ProductAvailability,
        'shopping_product.channel': enums.ProductChannel,
        'shopping_product.condition': enums.ProductCondition,
        // Placements
        'group_placement_view.placement_type': enums.PlacementType,
        'detail_placement_view.placement_type': enums.PlacementType,
        'performance_max_placement_view.placement_type': enums.PlacementType,
        'detail_content_suitability_placement_view.placement_type': enums.PlacementType,
        // Shared sets
        'shared_set.type': enums.SharedSetType,
        'shared_set.status': enums.SharedSetStatus,
        'shared_criterion.type': enums.CriterionType,
        // Customer negative criteria
        'customer_negative_criterion.type': enums.CriterionType,
        'customer_negative_criterion.content_label.type': enums.ContentLabelType,
        // Brand safety
        'campaign.video_brand_safety_suitability': enums.BrandSafetySuitability,
        // Campaign shared sets
        'campaign_shared_set.status': enums.CampaignSharedSetStatus,
        // Customizers
        'customizer_attribute.type': enums.CustomizerAttributeType,
        'customizer_attribute.status': enums.CustomizerAttributeStatus,
        'ad_group_customizer.status': enums.CustomizerValueStatus,
        'ad_group_customizer.value.type': enums.CustomizerAttributeType,
        'ad_group_criterion_customizer.status': enums.CustomizerValueStatus,
        'ad_group_criterion_customizer.value.type': enums.CustomizerAttributeType,
        'campaign_customizer.status': enums.CustomizerValueStatus,
        'campaign_customizer.value.type': enums.CustomizerAttributeType,
        'customer_customizer.status': enums.CustomizerValueStatus,
        'customer_customizer.value.type': enums.CustomizerAttributeType,
    };
}

export function flattenRow(obj, prefix = '') {
    const flattened = {};
    for (const [key, value] of Object.entries(obj)) {
        const newKey = prefix ? `${prefix}.${key}` : key;
        if (Array.isArray(value)) {
            if (value.length > 0 && typeof value[0] === 'object' && value[0].text !== undefined) {
                flattened[newKey] = value.map(item => item.text).join(' | ');
            } else if (value.every(item => typeof item === 'string')) {
                flattened[newKey] = value.join(' | ');
            } else {
                flattened[newKey] = JSON.stringify(value);
            }
        } else if (value && typeof value === 'object') {
            Object.assign(flattened, flattenRow(value, newKey));
        } else {
            flattened[newKey] = value;
        }
    }
    return flattened;
}

export function resolveEnums(row, enumFieldMap) {
    for (const [key, value] of Object.entries(row)) {
        if (value !== null && value !== undefined && enumFieldMap[key]) {
            const label = enumFieldMap[key][value];
            if (typeof label === 'string') {
                row[key] = label;
            }
        }
    }
    return row;
}

export function extractIssueCodes(row) {
    if (row['shopping_product.issues']) {
        try {
            const issues = JSON.parse(row['shopping_product.issues']);
            if (Array.isArray(issues)) {
                row['shopping_product.issue_codes'] = issues
                    .map(i => i.error_code)
                    .filter(Boolean)
                    .join(' | ');
            }
        } catch {
            row['shopping_product.issue_codes'] = '';
        }
    }
    return row;
}

export function resolveAssetAutomation(row, enums) {
    if (row['campaign.asset_automation_settings']) {
        try {
            const settings = JSON.parse(row['campaign.asset_automation_settings']);
            if (Array.isArray(settings)) {
                const resolved = settings.map(s => ({
                    asset_automation_type: enums.AssetAutomationType[s.asset_automation_type] || s.asset_automation_type,
                    asset_automation_status: enums.AssetAutomationStatus[s.asset_automation_status] || s.asset_automation_status,
                }));
                row['campaign.asset_automation_settings'] = JSON.stringify(resolved);
            }
        } catch {
            // Leave as-is if parsing fails.
        }
    }
    return row;
}

export function convertMicros(row) {
    const converted = {};
    for (const [key, value] of Object.entries(row)) {
        if (key.endsWith('_micros')) {
            const newKey = key.replace('_micros', '');
            converted[newKey] = value !== null && value !== undefined && value !== ''
                ? (Number(value) / 1_000_000).toFixed(2)
                : value;
        } else if (microsFields.has(key)) {
            converted[key] = value !== null && value !== undefined && value !== ''
                ? (Number(value) / 1_000_000).toFixed(2)
                : value;
        } else {
            converted[key] = value;
        }
    }
    return converted;
}

export function transformRow(row, enumFieldMap, enums) {
    const flattened = flattenRow(row);
    resolveEnums(flattened, enumFieldMap);
    extractIssueCodes(flattened);
    resolveAssetAutomation(flattened, enums);
    return convertMicros(flattened);
}

export function normalizeHeaderField(field) {
    return field.endsWith('_micros') ? field.replace('_micros', '') : field;
}

export function stripGaqlLineComments(gaql) {
    return gaql
        .split('\n')
        .map(line => line.replace(/--.*$/, '').trimEnd())
        .join('\n')
        .trim();
}

export function deriveHeadersFromGaql(gaql) {
    const cleaned = stripGaqlLineComments(gaql);
    const match = cleaned.match(/\bSELECT\b([\s\S]*?)\bFROM\b/i);
    if (!match) {
        throw new Error('Could not derive CSV headers: GAQL must contain SELECT ... FROM');
    }

    const fields = match[1]
        .split(',')
        .map(field => normalizeHeaderField(field.trim()))
        .filter(Boolean);

    if (fields.length === 0) {
        throw new Error('Could not derive CSV headers: SELECT list is empty');
    }

    const resourceRoots = new Set();
    for (const field of fields) {
        const root = field.split('.')[0];
        if (root && root !== 'metrics' && root !== 'segments') {
            resourceRoots.add(root);
        }
    }

    const fromMatch = cleaned.match(/\bFROM\s+([a-zA-Z_][a-zA-Z0-9_]*)\b/i);
    if (fromMatch) {
        resourceRoots.add(fromMatch[1]);
    }

    for (const root of resourceRoots) {
        fields.push(`${root}.resource_name`);
    }

    if (fields.some(field => field.startsWith('ad_group_ad.ad.'))) {
        fields.push('ad_group_ad.ad.resource_name');
    }

    if (fields.includes('shopping_product.issues') && !fields.includes('shopping_product.issue_codes')) {
        fields.push('shopping_product.issue_codes');
    }

    return Array.from(new Set(fields)).sort();
}

export function csvEscape(value) {
    if (value === null || value === undefined) {
        return '';
    }

    const stringValue = String(value);
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
}

export function rowToCsvLine(row, headers) {
    return headers.map(header => csvEscape(row[header])).join(',');
}
