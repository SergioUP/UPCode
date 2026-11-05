#include "UPCodeSourceTextShadowNode.h"
#include "UPCodeSourceTextRunShadowNode.h"
#include <react/renderer/components/view/ViewShadowNode.h>
#import <react/renderer/textlayoutmanager/RCTAttributedTextUtils.h>

#include <algorithm>
#include <cmath>

namespace facebook::react {

UPCodeSourceTextShadowNode::UPCodeSourceTextShadowNode(
    const ShadowNode &sourceShadowNode, const ShadowNodeFragment &fragment)
    : ConcreteViewShadowNode(sourceShadowNode, fragment){};

Size UPCodeSourceTextShadowNode::measureContent(
    const LayoutContext &layoutContext,
    const LayoutConstraints &layoutConstraints) const {
  const auto &baseProps = getConcreteProps();

  auto baseTextAttributes = TextAttributes::defaultTextAttributes();
  baseTextAttributes.backgroundColor = baseProps.backgroundColor;
  baseTextAttributes.allowFontScaling = baseProps.allowFontScaling;

  Float fontSizeMultiplier = 1.0;
  if (baseTextAttributes.allowFontScaling) {
    fontSizeMultiplier = layoutContext.fontSizeMultiplier;
  }

  auto baseAttributedString = AttributedString{};
  const auto &children = getChildren();
  for (size_t i = 0; i < children.size(); i++) {
    const auto child = children[i].get();
    if (auto textViewChild =
            dynamic_cast<const UPCodeSourceTextRunShadowNode *>(child)) {
      auto &props = textViewChild->getConcreteProps();
      auto fragment = AttributedString::Fragment{};
      auto textAttributes = TextAttributes::defaultTextAttributes();

      textAttributes.allowFontScaling = baseProps.allowFontScaling;
      textAttributes.backgroundColor = props.backgroundColor;
      textAttributes.fontSize = props.fontSize * fontSizeMultiplier;
      textAttributes.lineHeight = props.lineHeight * fontSizeMultiplier;
      textAttributes.foregroundColor = props.color;
      textAttributes.textShadowColor = props.shadowColor;
      textAttributes.textShadowOffset = props.shadowOffset;
      textAttributes.textShadowRadius = props.shadowRadius;
      textAttributes.letterSpacing = props.letterSpacing;
      textAttributes.textDecorationColor = props.textDecorationColor;
      textAttributes.fontFamily = props.fontFamily;

      if (props.fontStyle == UPCodeSourceTextRunFontStyle::Italic) {
        textAttributes.fontStyle = FontStyle::Italic;
      } else {
        textAttributes.fontStyle = FontStyle::Normal;
      }

      if (props.fontWeight == UPCodeSourceTextRunFontWeight::Bold) {
        textAttributes.fontWeight = FontWeight::Bold;
      } else if (props.fontWeight == UPCodeSourceTextRunFontWeight::UltraLight) {
        textAttributes.fontWeight = FontWeight::UltraLight;
      } else if (props.fontWeight == UPCodeSourceTextRunFontWeight::Light) {
        textAttributes.fontWeight = FontWeight::Light;
      } else if (props.fontWeight == UPCodeSourceTextRunFontWeight::Medium) {
        textAttributes.fontWeight = FontWeight::Medium;
      } else if (props.fontWeight == UPCodeSourceTextRunFontWeight::Semibold) {
        textAttributes.fontWeight = FontWeight::Semibold;
      } else if (props.fontWeight == UPCodeSourceTextRunFontWeight::Heavy) {
        textAttributes.fontWeight = FontWeight::Heavy;
      } else {
        textAttributes.fontWeight = FontWeight::Regular;
      }

      if (props.textDecorationLine ==
          UPCodeSourceTextRunTextDecorationLine::LineThrough) {
        textAttributes.textDecorationLineType =
            TextDecorationLineType::Strikethrough;
      } else if (props.textDecorationLine ==
                 UPCodeSourceTextRunTextDecorationLine::Underline) {
        textAttributes.textDecorationLineType =
            TextDecorationLineType::Underline;
      } else {
        textAttributes.textDecorationLineType = TextDecorationLineType::None;
      }

      if (props.textDecorationStyle ==
          UPCodeSourceTextRunTextDecorationStyle::Solid) {
        textAttributes.textDecorationStyle = TextDecorationStyle::Solid;
      } else if (props.textDecorationStyle ==
                 UPCodeSourceTextRunTextDecorationStyle::Dotted) {
        textAttributes.textDecorationStyle = TextDecorationStyle::Dotted;
      } else if (props.textDecorationStyle ==
                 UPCodeSourceTextRunTextDecorationStyle::Dashed) {
        textAttributes.textDecorationStyle = TextDecorationStyle::Dashed;
      } else if (props.textDecorationStyle ==
                 UPCodeSourceTextRunTextDecorationStyle::Double) {
        textAttributes.textDecorationStyle = TextDecorationStyle::Double;
      }

      if (props.textAlign == UPCodeSourceTextRunTextAlign::Left) {
        textAttributes.alignment = TextAlignment::Left;
      } else if (props.textAlign == UPCodeSourceTextRunTextAlign::Right) {
        textAttributes.alignment = TextAlignment::Right;
      } else if (props.textAlign == UPCodeSourceTextRunTextAlign::Center) {
        textAttributes.alignment = TextAlignment::Center;
      } else if (props.textAlign == UPCodeSourceTextRunTextAlign::Justify) {
        textAttributes.alignment = TextAlignment::Justified;
      } else if (props.textAlign == UPCodeSourceTextRunTextAlign::Auto) {
        textAttributes.alignment = TextAlignment::Natural;
      }

      textAttributes.backgroundColor = props.backgroundColor;

      fragment.string = props.text;
      fragment.textAttributes = textAttributes;

      baseAttributedString.appendFragment(std::move(fragment));
    }
  }

  _attributedString = baseAttributedString;

  NSMutableAttributedString *convertedAttributedString =
      [RCTNSAttributedStringFromAttributedString(baseAttributedString)
          mutableCopy];
  // Match React Native's baseline offset in both measurement and rendering.
  RCTApplyBaselineOffset(convertedAttributedString);

  const CGFloat maximumWidth =
      std::isfinite(layoutConstraints.maximumSize.width)
          ? layoutConstraints.maximumSize.width
          : CGFLOAT_MAX;
  NSTextStorage *textStorage = [[NSTextStorage alloc]
      initWithAttributedString:convertedAttributedString];
  NSLayoutManager *layoutManager = [[NSLayoutManager alloc] init];
  layoutManager.usesFontLeading = NO;
  NSTextContainer *textContainer = [[NSTextContainer alloc]
      initWithSize:CGSizeMake(maximumWidth, CGFLOAT_MAX)];
  textContainer.lineFragmentPadding = 0;
  textContainer.maximumNumberOfLines = baseProps.numberOfLines;
  if (baseProps.ellipsizeMode == UPCodeSourceTextEllipsizeMode::Head) {
    textContainer.lineBreakMode = NSLineBreakByTruncatingHead;
  } else if (baseProps.ellipsizeMode == UPCodeSourceTextEllipsizeMode::Middle) {
    textContainer.lineBreakMode = NSLineBreakByTruncatingMiddle;
  } else if (baseProps.ellipsizeMode == UPCodeSourceTextEllipsizeMode::Tail) {
    textContainer.lineBreakMode = NSLineBreakByTruncatingTail;
  } else {
    textContainer.lineBreakMode = NSLineBreakByClipping;
  }
  [layoutManager addTextContainer:textContainer];
  [textStorage addLayoutManager:layoutManager];
  [layoutManager ensureLayoutForTextContainer:textContainer];
  const CGRect usedRect =
      [layoutManager usedRectForTextContainer:textContainer];

  return {
      std::clamp(static_cast<Float>(std::ceil(usedRect.size.width)),
                 layoutConstraints.minimumSize.width,
                 layoutConstraints.maximumSize.width),
      std::clamp(static_cast<Float>(std::ceil(usedRect.size.height)),
                 layoutConstraints.minimumSize.height,
                 layoutConstraints.maximumSize.height),
  };
}

void UPCodeSourceTextShadowNode::layout(LayoutContext layoutContext) {
  ensureUnsealed();
  setStateData(UPCodeSourceTextStateReal{
      _attributedString,
  });
}
} // namespace facebook::react
