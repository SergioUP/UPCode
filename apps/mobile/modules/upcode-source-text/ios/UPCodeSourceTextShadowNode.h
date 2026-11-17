#pragma once

#include <react/renderer/components/UPCodeSourceTextSpec/EventEmitters.h>
#include <react/renderer/components/UPCodeSourceTextSpec/Props.h>
#include <react/renderer/components/view/ConcreteViewShadowNode.h>
#include <react/renderer/core/LayoutContext.h>
#include <react/renderer/core/ShadowNode.h>
#include <react/renderer/textlayoutmanager/TextLayoutManager.h>

namespace facebook::react {

extern const char UPCodeSourceTextComponentName[];

class UPCodeSourceTextStateReal final {
public:
  AttributedString attributedString;
};

class UPCodeSourceTextShadowNode final
    : public ConcreteViewShadowNode<UPCodeSourceTextComponentName,
                                    UPCodeSourceTextProps, UPCodeSourceTextEventEmitter,
                                    UPCodeSourceTextStateReal> {
public:
  using ConcreteViewShadowNode::ConcreteViewShadowNode;

  UPCodeSourceTextShadowNode(const ShadowNode &sourceShadowNode,
                         const ShadowNodeFragment &fragment);

  static ShadowNodeTraits BaseTraits() {
    auto traits = ConcreteViewShadowNode::BaseTraits();
    traits.set(ShadowNodeTraits::Trait::LeafYogaNode);
    traits.set(ShadowNodeTraits::Trait::MeasurableYogaNode);
    return traits;
  }

  void layout(LayoutContext layoutContext) override;

  Size
  measureContent(const LayoutContext &layoutContext,
                 const LayoutConstraints &layoutConstraints) const override;

private:
  mutable AttributedString _attributedString;
};
} // namespace facebook::react
