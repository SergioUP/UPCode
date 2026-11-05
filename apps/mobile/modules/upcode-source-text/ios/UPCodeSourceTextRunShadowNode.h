#pragma once

#include <react/renderer/components/UPCodeSourceTextSpec/EventEmitters.h>
#include <react/renderer/components/UPCodeSourceTextSpec/Props.h>
#include <react/renderer/components/UPCodeSourceTextSpec/States.h>
#include <react/renderer/components/view/ConcreteViewShadowNode.h>

namespace facebook::react {
extern const char UPCodeSourceTextRunComponentName[];

using UPCodeSourceTextRunShadowNode =
    ConcreteViewShadowNode<UPCodeSourceTextRunComponentName, UPCodeSourceTextRunProps,
                           UPCodeSourceTextRunEventEmitter, UPCodeSourceTextRunState>;
} // namespace facebook::react
