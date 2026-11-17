#pragma once

#include "UPCodeSourceTextShadowNode.h"

#include <react/renderer/componentregistry/ComponentDescriptorProviderRegistry.h>
#include <react/renderer/core/ConcreteComponentDescriptor.h>

namespace facebook::react {
using UPCodeSourceTextComponentDescriptor =
    ConcreteComponentDescriptor<UPCodeSourceTextShadowNode>;

void UPCodeSourceTextSpec_registerComponentDescriptorsFromCodegen(
    std::shared_ptr<const ComponentDescriptorProviderRegistry> registry);
} // namespace facebook::react
